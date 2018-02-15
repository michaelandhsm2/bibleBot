var realdbRef,
  db;

exports.handler = function(req, res, database, firestore) {
  realdbRef = database.ref('v2');
  db = firestore;

  if (req.body.events) {
    var events = req.body.events;

    events.forEach(function(event) {
      console.log("Event - " + JSON.stringify(event));
      lineEvent(event);
    });
  } else if (req.body.Timestamp) {
    formEvent(req.body);
  } else {
    console.log("Body - " + JSON.stringify(req.body));
  }

  res.status(200).send();
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
    });

  } else if (event.type == "join") {

    //

  } else if (event.type == "postback") {

    var data = JSON.parse(event.postback.data);
    // Check if user who clicked the button is the intended target.
    if (data.userId == event.source.userId){
      //換名稱確認
      if (data.action == "changeNameConfirm") {
        if (data.result) {
          var userRef = db.collection('users').doc(event.source.userId);
          userRef.update({chatState: 'normal', username: data.name}).then(function() {
            var response = data.name + "，\n你的暱稱更新完成了！";
            replyMessage(event.replyToken, response);
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

    response = "Not Implemented Yet";

  } else if (/[Jj]oin|加入|上車/.test(text)) {

    asyncResponse = true;

  } else if (/[Ll]eave|離開|下車/.test(text)) {

    asyncResponse = true;
    // scriptFunction('aboard', 'me');
    response = "Not Implemented Yet";

  } else if (/[Cc]hange|改[暱名]稱/.test(text) && event.source.type == "user") {

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

    // scriptFunction('aboard', 'me');
    response = "Not Implemented Yet";

  } else if (/[Qq]&[Aa]|都給你問/.test(text)) {

    // scriptFunction('aboard', 'me');
    response = "Not Implemented Yet";

  } else {

    asyncResponse = true;

    getUserIdentity(event.source).then(function(profile) {

      if (profile.chatState == 'changeName') {
        var name = text.replace(/@.*[Bb]ible *[Bb]ot */, "");
        response = {
          type: "template",
          altText: "請用手機看 QQ，電腦沒辦法看按鈕 WWW",
          template: {
            type: "confirm",
            text: profile.username + "，\n你確定要把名稱換成 '" + name + "' 嗎？",
            actions: [
              {
                type: "postback",
                label: "是的",
                data: JSON.stringify({action: "changeNameConfirm", result: true, userId: profile.userId, name: name}),
                displayText: "是的，我希望把名稱改成 '"+ name+"'"
              }, {
                type: "postback",
                label: "不要",
                data: JSON.stringify({action: "changeNameConfirm", result: false, userId: profile.userId, name: name}),
                displayText: "不要"
              }
            ]
          }
        };

      } else {
        response = "Not Implemented Yet";

      }
      replyMessage(event.replyToken, response);

    });

  }

  if (!asyncResponse) {
    replyMessage(event.replyToken, response);
  }

}

//  General Functions
//

var getObject = function(ref, value = null, searchKey = 'uid') {
  if (value) {
    return ref.orderByChild(searchKey).equalTo(value).once('value').then(function(snapshot) {
      var object = snapshot.val();
      for (key in object)
        return object[key];
      }
    );
  } else {
    return ref.once('value').then(function(snapshot) {
      var response = {};
      var object = snapshot.val();
      for (key in object) {
        response[key] = object[key];
      }
      return (response)
    });
  }
}

var getObjectList = function(ref, item = null) {

  return ref.once('value').then(function(snapshot) {
    var response = [];

    snapshot.forEach(function(childSnapshot) {
      var childData = childSnapshot.val();
      if (item) {
        response.push(childData[item]);
      } else {
        response.push(childData);
      }
    });

    return response;
  });
}

var pushToDatabase = function(ref, object) {
  var newRef = ref.push();
  object['uid'] = newRef.key;
  newRef.set(object);
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
  return db.collection('users').doc(profile.userId).set(profile).then(function() {
    return profile;
  });
}

//
//Google Script API related functions

var {
  google
} = require('googleapis');
var googleClient = require('./keys/googleClientKey.json');
const oauth2Client = new google.auth.OAuth2(googleClient.client_id, googleClient.client_secret, googleClient.redirect_uris);
const DB_TOKEN_PATH = '/api_tokens';

let oauthTokens = null;
const script = google.script('v1');
const scriptId = 'MYMsBbjHC6NN37LwMegmeuj5Vpmfnj_hu';

var authorize = function() {
  // Check if we have previously stored a token.
  return new Promise((resolve, reject) => {
    if (oauthTokens) {
      return resolve(oauth2Client);
    } else {
      return realdbRef.child(DB_TOKEN_PATH).once('value').then((snapshot) => {
        oauthTokens = snapshot.val();
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
  console.log("Script Function - " + functionName + " : " + functionParameters)
  authorize().then(function(auth) {
    callAppsScript(auth, {
      auth: auth,
      resource: {
        function: functionName,
        parameters: functionParameters,
        devMode: false
      },
      scriptId: scriptId
    });
  });
}
