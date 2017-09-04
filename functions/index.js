// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
var admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");

// Install related npm modules - npm install @line/bot-sdk cors axios -save
const line = require('@line/bot-sdk');
var lineAccount = require("./lineKey.json");
const client = new line.Client(lineAccount);
const axios = require('axios');
const cors = require('cors')({
  origin: true
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://biblebot-f4704.firebaseio.com"
});

const dbRef = admin.database().ref();

exports.webhook = functions.https.onRequest((req, res) => {
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
});

var formEvent = function(event) {
  console.log("Body - " + JSON.stringify(event));
  var response = {
    'name': event["我是"],
    'next': event["我下一個要指定"],
    'segment': event["出處"],
    'text': event["段落"],
    'comments': event["心得"]
  };
  var message = "[本日金句]\n\
列車長 - " + response.name + "\n明日列車長 - " + response.next+"\n\n<" + response.segment + ">\n" + response.text + "\n\n";
  if (response.comments != "") {
    message += "心得：\n" + response.comments + "\n\n";
  }


  pushToDatabase(dbRef.child('responses'), response);
  pushToDatabase(dbRef.child('status/history'), response.name);
  dbRef.child('status').update({
    'next': response.next
  });

  getObjectList(dbRef.child('groups'), 'id').then(function(list) {
    list.forEach(function(groupId) {
      pushMessage(groupId, message);
    });
  });
}

var lineEvent = function(event) {
  if (event.type == "message" && event.message.type == "text") {
    var text = event.message.text;
    if (event.source.type == "user" || /@.*[Bb]ible *[Bb]ot/g.test(text)) {
      lineMessageEvent(event);
    }
  } else if (event.type == "join") {
    response = "哈囉~ 我是金句列車機器人BibleBot\n\n\
一來是想要把大家分享的金句系統化的整理起來，\
二來是相信有些人在開學後會有時候需要下車一下，等有時間跟心力時再上車，卻不好意思說。\n\
所以我就來這邊服務大家了！\n\n\
列車長們可以在群組裡面透過我繳交每日的金句，\
大家也可以根據自己的時間上車/下車。\
大家不好意思在這裡說也可以加我好友，並且私密我。\
這樣我也還是聽的到的！\n\n\
那想跟我說話(或執行什麼功能)，只要在話中打'@BibleBot'就可以了\
如果你不知道要問我甚麼，就從'@BibleBot 幫助'開始吧!";
    replyMessage(event.replyToken, response);

    pushToDatabase(dbRef.child('groups'), {
      'id': event.source.groupId
    })

  } else if (event.type == "follow") {
    response = "哈囉~ 我是金句列車機器人BibleBot\n\n\
如果你想上車，請打'@BibleBot Join'\n\
如果你想下車，請打'@BibleBot Leave'";
    replyMessage(event.replyToken, response);
  } else if (event.type == "leave") {
    var groupId = event.source.groupId;
    getObject(dbRef.groups, groupId, 'id').then(function(group) {
      dbRef.child('groups/' + group.uid).remove().then(function() {
          console.log("Remove succeeded.")
        })
        .catch(function(error) {
          console.log("Remove failed: " + error.message)
        });
    });

  }
}

var lineMessageEvent = function(event) {
  var response = "";
  var text = event.message.text;
  var asyncResponse = false;

  var groupId = "";
  if (event.source.type == "group") {
    groupId = event.source.groupId;
  }
  //Comfirmed to be talking to bot
  if (/[Hh]elp|幫助|功能/g.test(text)) {
    response = "如果要找我，在對話框中打'@BibleBot'&指示，就可以了!\n\n\
我的功能列表如下：\n\
=> 查詢功能 - '功能/幫助/Help'\n\
=> 呼叫表單 - '表單/Form'\n\
=> 查詢狀況 - '狀況/Status'\n\
=> 加入列車 - '加入/Join'\n\
=> 退出列車 - '退出/Leave'\n\n\
另外我在群組&私訊都可以運作喔，如果不希望在群組加入/退出列車，歡迎加我好友&私訊我喔！";
  } else if (/[Ff]orm|表單/g.test(text)) {
    response = {
      "type": "template",
      "altText": "表單連結：https://goo.gl/forms/FhV1nS1NromswOfu2",
      "template": {
        "type": "buttons",
        "thumbnailImageUrl": "https://lh3.googleusercontent.com/sg8XyC-IuDLkm27UpOPbbat1q3S2trJu85TGVuWeDLtVs5bKXbZxcLcOhJSZDGoi4zil98WBww",
        "text": "列車資訊",
        "actions": [{
          "type": "uri",
          "label": "開啟金句表單",
          "uri": "https://goo.gl/forms/FhV1nS1NromswOfu2"
        }]
      }
    };
  } else if (/[Ww]ebsite|網頁/g.test(text)) {
    //==> 呼叫網頁 - @BibleBot 網頁/Website\n\
  } else if (/[Ss]tatus|狀況/g.test(text)) {
    asyncResponse = true;
    getObject(dbRef.child("status")).then(function(status) {
      console.log(JSON.stringify(status));
      var list = [];
      for(key in status.passengers){
        list.push(status.passengers[key]);
      }
        console.log(JSON.stringify(list));

      response = "[列車資訊]\n\
列車長 - " + status.next + "\n\
目前乘客 - "+ list.join('、');

      replyMessage(event.replyToken, response);
    });
  } else if (/[Jj]oin|[Aa]dd|加入/g.test(text)) {
    asyncResponse = true;
    var userId = event.source.userId;
    getObject(dbRef.child('members'), userId, 'userId').then(function(member) {
      console.log("member - "+JSON.stringify(member));
      if (member === undefined) {
        accountLinking(userId, groupId).then(function(member) {
          addToTrain(member);
          response = "哈囉，" + member.name + "\n歡迎搭乘金句列車!\n讓我們啟航吧!";
          replyMessage(event.replyToken, response);
        });
      } else {
        addToTrain(member);
        response = "哈囉，" + member.name + "\n歡迎搭乘金句列車!\n讓我們啟航吧!";
        replyMessage(event.replyToken, response);
      }
    });
  } else if (/[Ee]xit|[Ll]eave|退出/g.test(text)) {
    response = "謝謝您搭乘金句列車! 讓我們有空時再會!";
    leaveTrain(event.source.userId);
  } else {
    asyncResponse = true;
    getObject(dbRef.child('members'), event.source.userId, 'userId').then(function(member) {
      if (member === undefined) {
        accountLinking(event.source.userId, groupId).then(function() {
          response = member.name + "，你在找我嗎？\n如果你不知道要問我甚麼，就從'@BibleBot 幫助'開始吧!";
          replyMessage(event.replyToken, response);
        });
      } else {
        response = member.name + "，你在找我嗎？\n如果你不知道要問我甚麼，就從'@BibleBot 幫助'開始吧!";
        replyMessage(event.replyToken, response);
      }
    });
  }

  if (asyncResponse != true) {
    replyMessage(event.replyToken, response);

    getObject(dbRef.child('members'), userId, 'userId').then(function(member) {
      if (userId === undefined) {
        accountLinking(userId, groupId);
      }
    });
  }

}

var leaveTrain = function(userId) {

  getObject(dbRef.child('members'), userId, 'userId').then(function(member) {
    dbRef.child('status/passengers/' + member.uid).remove();
    //TODO: 表單移除
  });

}

var addToTrain = function(member) {
  var name = member.name;
  var uid = member.uid;
  var object = {}
  object[uid] = name;

  dbRef.child('status/passengers').update(object);

  //TODO: 表單新增項目
}

var accountLinking = function(userId, groupId) {
  if (groupId != "") {
    var website = "https://api.line.me/v2/bot/group/" + groupId + "/member/" + userId;
  } else {
    var website = "https://api.line.me/v2/bot/profile/" + userId;
  }
  console.log(website);
  return axios({
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + lineAccount.channelAccessToken
    },
    url: website
  }).then(function(response) {
    console.log(response.data);
    return getObject(dbRef.child('members'), response.data.displayName, 'displayName').then(function(member) {
      console.log('member - ' + JSON.stringify(member));
      if (member === undefined) {
        var newRef = dbRef.child('members').push();
        var member = {
          'uid': newRef.key,
          'name': response.data.displayName,
          'displayName': response.data.displayName,
          'userId': response.data.userId,
          'pictureUrl': response.data.pictureUrl
        };
        newRef.set(member);

        //TODO: 表單更新姓名選項
      } else {
        dbRef.child('members/' + member.uid).update(response.data);
      }
      return member;
    });
  }).catch(error => {
    if (error.response) {
      console.log(error.response.data);
    }
  });
}

// // Line-Related Functions
//


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

// // General Functions
//

var getObject = function(ref, value = null, searchKey = 'uid') {
  if (value) {
    return ref.orderByChild(searchKey).equalTo(value).once('value').then(function(snapshot) {
      var object = snapshot.val();
      for (key in object)
        return object[key];
    });
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
