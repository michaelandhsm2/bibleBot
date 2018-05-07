let db;

exports.handler = (req, res, firestore) => {
  db = firestore;
  const promises = [];

  if (req.body.events) {
    const { events } = req.body;
    events.forEach((event) => {
      console.log(`Event - ${JSON.stringify(event)}`);
      lineEvent(event);
    });
  } else if (req.body.timestamp) {
    promises.push(formEvent(req.body));
  } else {
    console.log(`Body - ${JSON.stringify(req.body)}`);
  }

  Promise.all(promises).then(() => {
    res.status(200).send();
  });
};

function formEvent(payload) {
  const localPayload = payload;
  localPayload.timestamp = new Date(payload.timestamp);

  if (localPayload.triggerUid === '942883672') {
    return onFormSummit(localPayload);
  }

  console.log(`Time-based Trigger - ${localPayload.timestamp}`);
  const statusRef = db.collection('biblebot').doc('status');
  return statusRef.get().then((snapshot) => {
    const status = snapshot.data();
    const userRef = db.collection('users').doc(status.nextUserId);
    return userRef.get().then((snapshot2) => {
      const user = snapshot2.data();
      const localPromises = [];
      if (user.isEnabled) {
        const message = `${user.username}，\n今天是你當列車長喔！\n記得找時間來填金句列車~`;
        if (user.isFriend) {
          localPromises.push(pushMessage(user.userId, message));
        }
        localPromises.push(userRef.update({
          remindCount: user.remindCount + 1,
        }));
      } else {
        const message = `${user.username}跳槽了，認命吧 WWW`;
        localPromises.push(statusRef.update({ nextUserId: 'U8d37399db825fc670ff411a7aec672eb' }));
        localPromises.push(pushMessage('U8d37399db825fc670ff411a7aec672eb', message));
      }
      return Promise.all(localPromises);
    });
  });
}

function onFormSummit(payload) {
  console.log(`Form Submit - ${JSON.stringify(payload)}`);
  db.collection('posts').add(payload);

  let message = `\
[本日金句]
列車長 - ${payload.name}
明日列車長 - " ${payload.next}
<${payload.origin}>
${payload.verse}
`;
  message += (payload.comments !== '') ? '' : `心得:\n${payload.comments}`;

  // Send line message to all groups
  const groupsRef = db.collection('groups');

  return groupsRef.get().then((qSnapshot) => {
    const promises = [];
    qSnapshot.forEach((groupDoc) => {
      const group = groupDoc.data();
      const sendMsg = pushMessage(group.id, message).then(() => {
        console.log(`Post delivered to ${group.name}`);
      });
      promises.push(sendMsg);
    });
    return Promise.all(promises);
  });
}

function lineEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    if (event.source.type === 'user' || /@.*[Bb]ible *[Bb]ot/.test(event.message.text)) {
      return lineMessageEvent(event);
    }
  } else if (event.type === 'follow') {
    return getUserIdentity(event.source).then((profile) => {
      const localPromises = [];
      let response = `\
哈囉，${profile.username}。
我是金句列車機器人BibleBot。
你可以用這個對話框來上下車、改暱稱。`;
      if(!profile.isEnabled){
        response = {
          type: "template",
          altText: "哈囉，" + profile.username + "。\n我是金句列車機器人BibleBot。\n你可以用這個對話框來上下車、改暱稱。",
          template: {
            type: "confirm",
            text: "哈囉，" + profile.username + "。\n我是金句列車機器人BibleBot。\n請問你要搭上金句列車嗎？",
            actions: [
              {
                type: "postback",
                label: "好啊",
                data: JSON.stringify({action: "joinConfirm", result: true, userId: profile.userId, name: profile.username}),
                displayText: "好啊"
              }, {
                type: "postback",
                label: "先不要好了",
                data: JSON.stringify({action: "joinConfirm", result: false, userId: profile.userId, name: profile.username}),
                displayText: "先不要好了"
              }
            ]
          }
        };
      }

      localPromises.push(replyMessage(event.replyToken, response));
      if (!profile.isFriend) {
        var u = db.collection('users').doc(profile.userId).update({isFriend: true});
        localPromises.push(u);
      }
      return Promise.all(localPromises);
    });

  } else if (event.type == "unfollow") {

    return getUserIdentity(event.source).then(function(profile) {
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
    return groupRef.set({id: multiId, type: event.source.type, name: "Unknown", timestamp: new Date()}).then(function() {
      var response = "哈囉~\n\
我是金句列車機器人BibleBot。\n\
如果你不知道要問我甚麼，就從'@BibleBot 幫助'開始吧!";
      return replyMessage(event.replyToken, response);
    });

  } else if (event.type == "leave") {

    return db.collection('groups').doc(event.source.groupId).delete();

  } else if (event.type == "postback") {

    var data = JSON.parse(event.postback.data);
    // Check if user who clicked the button is the intended target.
    if (data.userId == event.source.userId) {
      //換名稱確認
      if (data.action == "changeNameConfirm") {
        if (data.result) {
          var userRef = db.collection('users').doc(event.source.userId);
          return userRef.update({chatState: 'normal', username: data.name}).then(function() {
            var response = data.name + "，\n你的暱稱更新完成了！";
            return replyMessage(event.replyToken, response);
          });
        } else {
          var response = "那請再輸入一次希望的名稱。"
          return replyMessage(event.replyToken, response);
        }
      }else if(data.action == "joinConfirm"){
        var userRef = db.collection('users').doc(event.source.userId);
        var response = "沒問題，\n你想要加入時在下面輸入'加入'或'Join'即可~"
        if (data.result) {
          response = data.name + "，\n歡迎搭乘金句列車!\n讓我們啟航吧!";
        }
        return userRef.update({isEnabled: data.result}).then(function() {
          return replyMessage(event.replyToken, response);
        });
      }
    }
    return Promise.resolve();
  }
}

function lineMessageEvent(event) {
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
    return getUserIdentity(event.source).then(function(profile) {
      var userRef = db.collection('users').doc(profile.userId);
      return userRef.update({isEnabled: true}).then(function() {
        var response = profile.username + "，\n\
歡迎搭乘金句列車!\n讓我們啟航吧!";
        if (event.source.type != "user" && !profile.isFriend) {
          response += "\n\n請記得加我好友，我才能寄給你提醒訊息喔！"
        }
        return replyMessage(event.replyToken, response);
      });
    });

  } else if (/[Ll]eave|離開|下車/.test(text)) {

    asyncResponse = true;
    return getUserIdentity(event.source).then(function(profile) {
      var userRef = db.collection('users').doc(profile.userId);
      return userRef.update({isEnabled: false}).then(function() {
        var response = profile.username + "，\n謝謝您搭乘金句列車!\n讓我們有空時再會!";
        return replyMessage(event.replyToken, response);
      });
    });

  } else if (/[Ss]tatus|狀況/.test(text)) {

    asyncResponse = true;
    return db.collection('biblebot').doc('status').get().then(function(snapshot) {
      var status = snapshot.data();
      return db.collection('users').where('isEnabled', '==', true).get().then(function(qSnapshot) {
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

        return replyMessage(event.replyToken, response);
      });
    });

  } else if (/[Cc]hange|更改|改[暱名]稱/.test(text)) {

    asyncResponse = true;
    return getUserIdentity(event.source).then(function(profile) {
      var userRef = db.collection('users').doc(profile.userId);
      return userRef.update({chatState: 'changeName'}).then(function() {
        var response = profile.username + "，\n請輸入你新的暱稱：\n\n\
若你在群組，請在名稱前打'@BibleBot'並空一格\n\
例：@BibleBot Michael";
        replyMessage(event.replyToken, response);
      });
    });

  } else if (/[Ww]eb|網頁|過去金句|金句/.test(text)) {

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

    response = "Not Implemented Yet";

  } else {

    asyncResponse = true;
    return getUserIdentity(event.source).then(function(profile) {

      if (profile.chatState == 'changeName') {

        var name = text.replace(/@.*[Bb]ible *[Bb]ot */, "");
        return db.collection('users').where('username', '==', name).get().then(function(qSnapshot) {

          if (qSnapshot.empty) {
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
            }
          } else {
            response = profile.username + "，\n這個名字已經有人使用了，請再輸入其他的名稱。";
          }

          return replyMessage(event.replyToken, response);
        });

      } else {
        response = `\
${profile.username}，你在找我嗎？
如果你不知道要問我甚麼，就從'@BibleBot 幫助'開始吧!`;
        return replyMessage(event.replyToken, response);
      }
    });
  }

  if (!asyncResponse) {
    return replyMessage(event.replyToken, response);
  }
}

//  Line-Related Functions
//
const line = require('@line/bot-sdk');
const lineAccount = require('./keys/lineKey.json');

const client = new line.Client(lineAccount);

function replyMessage(replyToken, message) {
  return client.replyMessage(replyToken, processMessage(message))
    .catch((err) => {
      console.log(err);
    });
}

function pushMessage(recieverId, message) {
  return client.pushMessage(recieverId, processMessage(message))
    .catch((err) => {
      console.log(err);
    });
}

function processMessage(message) {
  let processedMessage;
  if (typeof message === 'object') {
    processedMessage = message;
  } else {
    processedMessage = {
      type: 'text',
      text: message,
    };
  }
  return (processedMessage);
}

//
//  Project Based Funcitons\  Retrieves user object with lineId

function getUserIdentity(source) {
  const userRef = db.collection('users').doc(source.userId);
  return userRef.get().then((snapshot) => {
    if (!snapshot.exists) {
      console.log('Retrieve user info from Line.');
      switch (source.type) {
        case 'room':
          return client.getRoomMemberProfile(source.roomId, source.userId)
            .then(createUserIdentity);
        case 'group':
          return client.getGroupMemberProfile(source.groupId, source.userId)
            .then(createUserIdentity);
        default:
          return client.getProfile(source.userId)
            .then(createUserIdentity);
      }
    } else {
      return snapshot.data();
    }
  });
}

function createUserIdentity(profile) {
  const localProfile = profile;
  localProfile.username = profile.displayName;
  localProfile.chatState = 'normal';
  localProfile.isEnabled = false;
  localProfile.isFriend = false;
  localProfile.lastSubmit = null;
  localProfile.submitCount = 0;
  localProfile.remindCount = 0;
  return db.collection('users').doc(profile.userId).set(profile).then(() => localProfile);
}
