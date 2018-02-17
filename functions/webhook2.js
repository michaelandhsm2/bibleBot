var db;

exports.handler = function(req, res, firestore) {
  db = firestore;

  if (req.body.events) {
    var events = req.body.events;

    events.forEach(function(event) {
      console.log("Event - " + JSON.stringify(event));
      lineEvent(event);
    });
  } else if (req.body.timestamp) {
    formEvent(req.body);
  } else {
    console.log("Body - " + JSON.stringify(req.body));
  }

  res.status(200).send();
}

var formEvent = function(payload) {

  payload.timestamp = new Date(payload.timestamp);

  if (payload.triggerUid == 942883672) {
    onFormSummit(payload);
  } else {
    console.log("Time-based Trigger - " + payload.timestamp);
    var statusRef = db.collection('biblebot').doc('status');
    statusRef.get().then(function(snapshot) {
      var status = snapshot.data();
      var userRef = db.collection('users').doc(status.nextUserId);
      userRef.get().then(function(snapshot2) {
        var user = snapshot2.data();
        var message = user.username + '，\n今天是你當列車長喔！\n記得找時間來填金句列車~';
        if (user.isFriend) {
          pushMessage(user.userId, message);
        }
      });
    });
  }
}

var onFormSummit = function(payload) {

  console.log("Form Submit - " + JSON.stringify(payload));
  var postRef = db.collection('posts').add(payload);
  var message = "[本日金句]\n\
列車長 - " + payload.name + "\n明日列車長 - " + payload.next + "\n\n<" + payload.origin + ">\n" + payload.verse + "\n\n";
  if (payload.comments != "") {
    message += "心得：\n" + payload.comments + "\n\n";
  }

  //Send line message to all groups
  var groupsRef = db.collection('groups');
  groupsRef.get().then(function(qSnapshot) {
    qSnapshot.forEach(function(groupDoc) {
      var group = groupDoc.data();
      pushMessage(group.id, message);
      console.log("Post delivered to " + group.name);
    });
  });

  //Identify current
  var usersRef = db.collection('users');
  usersRef.where('username', '==', payload.name).get().then(function(qSnapshot) {
    qSnapshot.forEach(function(userDoc) {
      var user = userDoc.data();
      console.log("Current - " + JSON.stringify(user.username));
      db.collection('users').doc(user.userId).update({
        lastSubmit: new Date(),
        submitCount: user.submitCount + 1
      });
    });
  });

  //Identify Next
  var statusRef = db.collection('biblebot').doc('status');
  usersRef.where('username', '==', payload.next).get().then(function(qSnapshot) {
    var promises = [];
    qSnapshot.forEach(function(userDoc) {
      var user = userDoc.data();
      console.log("Next - " + JSON.stringify(user.username));
      var t = db.runTransaction(function(trans) {
        return trans.get(statusRef).then(function(snapshot) {
          var data = snapshot.data();
          var newCount = data.postCount + 1;
          trans.update(statusRef, {
            postCount: newCount,
            nextUserId: user.userId
          });
        });
      });
      promises.push(t);
    });
    Promise.all(promises).then(formUpdate);
  });
}

var lineEvent = function(event) {
  if (event.type == "message" && event.message.type == "text") {

    if (event.source.type == "user" || /@.*[Bb]ible *[Bb]ot/.test(event.message.text)) {
      lineMessageEvent(event);
    }

  } else if (event.type == "follow") {

    getUserIdentity(event.source).then(function(profile) {
      var response = "\
哈囉，" + profile.username + "。\n\
歡迎加入真愛團契金句列車。\n\
你可以用這個對話框來上下車、改暱稱。"
      replyMessage(event.replyToken, response);
      if (!profile.isFriend) {
        db.collection('users').doc(profile.userId).update({isFriend: true});
      }
    });

  } else if (event.type == "unfollow") {

    getUserIdentity(event.source).then(function(profile) {
      db.collection('users').doc(profile.userId).update({isFriend: false});
    });

  } else if (event.type == "join") {

    var multiId;
    if (event.source.type == "group") {
      multiId = event.source.groupId;
    } else {
      multiId = event.source.roomId;
    }
    var groupRef = db.collection('groups').doc(multiId);
    groupRef.set({id: multiId, type: event.source.type, name: "Unknown", timestamp: new Date()}).then(function() {
      var response = "哈囉~\n\
我是金句列車機器人BibleBot。\n\
如果你不知道要問我甚麼，就從'@BibleBot 幫助'開始吧!";
      replyMessage(event.replyToken, response);
    });

  } else if (event.type == "leave") {

    var groupRef = db.collection('groups').doc(event.source.groupId).delete();

  } else if (event.type == "postback") {

    var data = JSON.parse(event.postback.data);
    // Check if user who clicked the button is the intended target.
    if (data.userId == event.source.userId) {
      //換名稱確認
      if (data.action == "changeNameConfirm") {
        if (data.result) {
          var userRef = db.collection('users').doc(event.source.userId);
          userRef.update({chatState: 'normal', username: data.name}).then(function() {
            var response = data.name + "，\n你的暱稱更新完成了！";
            replyMessage(event.replyToken, response);
            formUpdate();
          });
        } else {
          var response = "那請再輸入一次希望的名稱。"
          replyMessage(event.replyToken, response);
        }
      }

    }

  }

}

var lineMessageEvent = function(event) {
  var response = "";
  var text = event.message.text;
  var asyncResponse = false;

  if (/[Hh]elp|幫助|功能/.test(text)) {

    response = "如果要找我，在對話框中打'@BibleBot'&指示，就可以了!\n\n\
我的功能列表如下：\n\
=> 查詢功能：功能/幫助/Help\n\
=> 更改暱稱：更改/Change\n\
=> 呼叫表單：表單/Form\n\
=> 查詢狀況：狀況/Status\n\
=> 加入列車：加入/Join\n\
=> 退出列車：離開/Leave\n\n\
另外我在群組&私訊都可以運作喔，如果不希望在群組加入/退出列車，歡迎加我好友&私訊我喔！";

  } else if (/[Jj]oin|加入|上車/.test(text)) {

    asyncResponse = true;
    getUserIdentity(event.source).then(function(profile) {
      var userRef = db.collection('users').doc(profile.userId);
      userRef.update({isEnabled: true}).then(function() {
        var response = profile.username + "，\n\
歡迎搭乘金句列車!\n讓我們啟航吧!";
        if (event.source.type != "user" && !profile.isFriend) {
          response += "\n\n請記得加我好友，我才能寄給你提醒訊息喔！"
        }
        replyMessage(event.replyToken, response);
        formUpdate();
      });
    });

  } else if (/[Ll]eave|離開|下車/.test(text)) {

    asyncResponse = true;
    getUserIdentity(event.source).then(function(profile) {
      var userRef = db.collection('users').doc(profile.userId);
      userRef.update({isEnabled: false}).then(function() {
        var response = profile.username + "，\n謝謝您搭乘金句列車!\n讓我們有空時再會!";
        replyMessage(event.replyToken, response);
        formUpdate();
      });
    });

  } else if (/[Ss]tatus|狀況/.test(text)) {

    asyncResponse = true;
    db.collection('biblebot').doc('status').get().then(function(snapshot) {
      var status = snapshot.data();
      db.collection('users').where('isEnabled', '==', true).get().then(function(qSnapshot) {
        var users = [];
        var nextUserName;
        qSnapshot.forEach(function(userDoc) {
          var user = userDoc.data();
          if (user.userId == status.nextUserId) {
            nextUserName = user.username;
          }
          users.push(user.username);
        });
        response = "[列車資訊]\n明日列車長 - " + nextUserName + "\n目前乘客 - " + users.join('、');

        replyMessage(event.replyToken, response);
      });
    });

  } else if (/[Cc]hange|更改|改[暱名]稱/.test(text)) {

    asyncResponse = true;
    getUserIdentity(event.source).then(function(profile) {
      var userRef = db.collection('users').doc(profile.userId);
      userRef.update({chatState: 'changeName'}).then(function() {
        var response = profile.username + "，\n請輸入你新的暱稱：\n\n\
若你在群組，請在名稱前打'@BibleBot'並空一格\n\
例：@BibleBot Michael";
        replyMessage(event.replyToken, response);
      });
    });

  } else if (/[Ww]eb|網頁|過去金句|金句/.test(text)) {

    // scriptFunction('aboard', 'me');
    response = "Not Implemented Yet";

  } else if (/[Ff]orm|表單/.test(text)) {

    response = {
      "type": "template",
      "altText": "表單連結：https://goo.gl/forms/6Zu6kKf4aR0UczAH3",
      "template": {
        "type": "buttons",
        "text": "真愛團契金句列車",
        "thumbnailImageUrl": "https://lh3.googleusercontent.com/sg8XyC-IuDLkm27UpOPbbat1q3S2trJu85TGVuWeDLtVs5bKXbZxcLcOhJSZDGoi4zil98WBww",
        "actions": [
          {
            "type": "uri",
            "label": "開啟金句表單",
            "uri": "https://goo.gl/forms/6Zu6kKf4aR0UczAH3"
          }
        ]
      }
    };

  } else if (/[Qq]&[Aa]|都給你問/.test(text)) {

    // scriptFunction('aboard', 'me');
    response = "Not Implemented Yet";

  } else {

    asyncResponse = true;
    getUserIdentity(event.source).then(function(profile) {

      if (profile.chatState == 'changeName') {

        //TODO: Prevent username duplication
        var name = text.replace(/@.*[Bb]ible *[Bb]ot */, "");
        response = {
          type: "template",
          altText: "請用手機看 QQ，\n電腦沒辦法看按鈕 WWW",
          template: {
            type: "confirm",
            text: profile.username + "，\n你確定要把名稱換成 '" + name + "' 嗎？",
            actions: [
              {
                type: "postback",
                label: "是的",
                data: JSON.stringify({action: "changeNameConfirm", result: true, userId: profile.userId, name: name}),
                displayText: "是的，我希望把名稱改成 '" + name + "'"
              }, {
                type: "postback",
                label: "不要",
                data: JSON.stringify({action: "changeNameConfirm", result: false, userId: profile.userId, name: name}),
                displayText: "不要"
              }
            ]
          }
        };
        replyMessage(event.replyToken, response);

      } else {
        response = profile.username + "，你在找我嗎？\n如果你不知道要問我甚麼，就從'@BibleBot 幫助'開始吧!";
        replyMessage(event.replyToken, response);

      }

    });

  }

  if (!asyncResponse) {
    replyMessage(event.replyToken, response);
  }

}

//  Line-Related Functions
//
const line = require('@line/bot-sdk');
var lineAccount = require("./keys/line2Key.json");
const client = new line.Client(lineAccount);

var replyMessage = function(replyToken, message) {
  client.replyMessage(replyToken, processMessage(message)).then(function() {
    //res.status(200).send();
  }).catch(function(err) {
    console.log(err);
  });
}

var pushMessage = function(recieverId, message) {
  client.pushMessage(recieverId, processMessage(message)).then(function() {
    //res.status(200).send();
  }).catch(function(err) {
    console.log(err);
  });
}

var processMessage = function(message) {
  var processedMessage = {};
  if (typeof message === 'object') {
    processedMessage = message;
  } else {
    processedMessage = {
      type: 'text',
      text: message
    };
  }
  return (processedMessage);
}

//
//  Project Based Funcitons\  Retrieves user object with lineId

var getUserIdentity = function(source) {
  var userRef = db.collection('users').doc(source.userId);
  return userRef.get().then(function(snapshot) {
    if (!snapshot.exists) {
      console.log("Retrieve user info from Line.");
      switch (source.type) {
        case 'room':
          return client.getRoomMemberProfile(source.roomId, source.userId).then(createUserIdentity);
        case 'group':
          return client.getGroupMemberProfile(source.groupId, source.userId).then(createUserIdentity);
        default:
          return client.getProfile(source.userId).then(createUserIdentity);
      }
    } else {
      return snapshot.data();
    }
  });
}

var createUserIdentity = function(profile) {
  profile.username = profile.displayName;
  profile.chatState = 'normal';
  profile.isEnabled = false;
  profile.isFriend = false;
  profile.lastSubmit = null;
  profile.submitCount = 0;
  return db.collection('users').doc(profile.userId).set(profile).then(function() {
    return profile;
  });
}

var formUpdate = function() {
  var usersRef = db.collection('users');
  var statusRef = db.collection('biblebot').doc('status');
  statusRef.get().then(function(snapshot) {
    var status = snapshot.data();
    usersRef.where('isEnabled', '==', true).orderBy('lastSubmit').get().then(function(qSnapshot) {
      var users = [];
      var nextUsers = [];
      qSnapshot.forEach(function(userDoc) {
        var user = userDoc.data();
        if (user.userId == status.nextUserId) {
          users.unshift(user.username);
        } else {
          users.push(user.username);
          nextUsers.push(user.username + " - " + daysAgo(user.lastSubmit));
        }
      });
      scriptFunction("refresh", [users, nextUsers]);
    });
  });
}

var daysAgo = function(lastSubmit) {
  if (!lastSubmit) {
    return ("Never");
  } else {
    var today = new Date();
    lastSubmit.setHours(0, 0, 0, 0);
    var daysDiff = Math.floor((today - lastSubmit) / (24 * 60 * 60 * 1000));
    if (daysDiff > 1) {
      return (daysDiff + " days ago");
    } else if (daysDiff == 1) {
      return ("Yesterday");
    } else {
      return ("Today");
    }
  }
}

//
//Google Script API related functions

var {
  google
} = require('googleapis');
var googleClient = require('./keys/googleClientKey.json');
const oauth2Client = new google.auth.OAuth2(googleClient.client_id, googleClient.client_secret, googleClient.redirect_uris);

let oauthTokens = null;
const script = google.script('v1');
const scriptId = 'MYMsBbjHC6NN37LwMegmeuj5Vpmfnj_hu';

var authorize = function() {
  // Check if we have previously stored a token.
  return new Promise((resolve, reject) => {
    if (oauthTokens) {
      return resolve(oauth2Client);
    } else {
      return db.collection('biblebot').doc('api_tokens').get().then((snapshot) => {
        oauthTokens = snapshot.data();
        oauth2Client.setCredentials(oauthTokens);
        return resolve(oauth2Client);
      }).catch(() => reject());
    }
  });
}

var callAppsScript = function(auth, setting) {

  // Make the API request. The request object is included here as 'resource'.
  script.scripts.run(setting, function(err, resp) {
    if (err) {
      // The API encountered a problem before the script started executing.
      console.log('The API returned an error: ' + err);
      return;
    }
    if (resp.error) {
      // The API executed, but the script returned an error.

      // Extract the first (and only) set of error details. The values of this
      // object are the script's 'errorMessage' and 'errorType', and an array
      // of stack trace elements.
      var error = resp.error.details[0];
      console.log('Script error message: ' + error.errorMessage);
      console.log('Script error stacktrace:');

      if (error.scriptStackTraceElements) {
        // There may not be a stacktrace if the script didn't start executing.
        for (var i = 0; i < error.scriptStackTraceElements.length; i++) {
          var trace = error.scriptStackTraceElements[i];
          console.log('\t%s: %s', trace.function, trace.lineNumber);
        }
      }
    }
  });
}

var scriptFunction = function(functionName, functionParameters) {
  if (!Array.isArray(functionParameters)) {
    functionParameters = [functionParameters];
  }
  console.log("Script Function - " + functionName + " : " + functionParameters);
  return authorize().then(function(auth) {
    callAppsScript(auth, {
      auth: auth,
      resource: {
        function: functionName,
        parameters: functionParameters,
        devMode: false
      },
      scriptId: scriptId
    });
  }).catch(function(error) {
    console.log(error);
  });
}
