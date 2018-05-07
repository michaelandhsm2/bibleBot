let db;

exports.postSubmitted = function postSubmitted(firestore, payload) {
  // var promises = [];

  const usersRef = db.collection('users');
  const statusRef = db.collection('biblebot').doc('status');

  db = firestore;

  const idNext = usersRef.where('username', '==', payload.next).get().then((qSnapshot) => {
    const localPromises = [];
    qSnapshot.forEach((userDoc) => {
      const user = userDoc.data();
      console.log(`Next - ${JSON.stringify(user.username)}`);
      const u = statusRef.update({ nextUserId: user.userId });
      localPromises.push(u);
    });
    return Promise.all(localPromises);
  });

  return idNext.then(function(){
    usersRef.where('username', '==', payload.name).get().then(function(qSnapshot) {
      var localPromises = [];
      qSnapshot.forEach(function(userDoc) {
        var user = userDoc.data();
        console.log("Current - " + JSON.stringify(user.username));
        var u = db.collection('users').doc(user.userId).update({
          lastSubmit: payload.timestamp,
          remindCount: 0,
          submitCount: user.submitCount + 1
        });
        localPromises.push(u);
      });
      return Promise.all(localPromises);
    });
  });
}

exports.formUpdate = function(firestore) {
  db = firestore;

  var usersRef = db.collection('users');
  var statusRef = db.collection('biblebot').doc('status');
  return statusRef.get().then(function(snapshot) {
    var status = snapshot.data();
    return usersRef.where('isEnabled', '==', true).orderBy('lastSubmit').get().then(function(qSnapshot) {
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
      return scriptFunction("refresh", [users, nextUsers]);
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
  return script.scripts.run(setting, function(err, resp) {
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
    return callAppsScript(auth, {
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
