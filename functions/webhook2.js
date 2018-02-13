var dbref;

exports.handler = function(req, res, database) {
  dbRef = database.ref('v2');

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
    lineMessageEvent(event);
  }
}

var lineMessageEvent = function(event) {
  var response = "";
  var text = event.message.text;
  var asyncResponse = false;

  //Comfirmed to be talking to bot
  if (/[Hh]elp|幫助|功能/g.test(text)) {
    scriptFunction('aboard','me');
    response = "Me Added.";
  } else {
    response = text;
  }

  if (asyncResponse != true) {
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
//Google Script API related functions

var {google} = require('googleapis');
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
      return dbRef.child(DB_TOKEN_PATH).once('value').then((snapshot) => {
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
