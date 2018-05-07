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

  return idNext.then(() => {
    usersRef.where('username', '==', payload.name).get().then((qSnapshot) => {
      const localPromises = [];
      qSnapshot.forEach((userDoc) => {
        const user = userDoc.data();
        console.log(`Current - ${JSON.stringify(user.username)}`);
        const u = db.collection('users').doc(user.userId).update({
          lastSubmit: payload.timestamp,
          remindCount: 0,
          submitCount: user.submitCount + 1,
        });
        localPromises.push(u);
      });
      return Promise.all(localPromises);
    });
  });
};

exports.formUpdate = (firestore) => {
  db = firestore;
  const usersRef = db.collection('users');
  const statusRef = db.collection('biblebot').doc('status');

  return statusRef.get().then((snapshot) => {
    const status = snapshot.data();
    return usersRef.where('isEnabled', '==', true).orderBy('lastSubmit').get().then((qSnapshot) => {
      const users = [];
      const nextUsers = [];
      qSnapshot.forEach((userDoc) => {
        const user = userDoc.data();
        if (user.userId === status.nextUserId) {
          users.unshift(user.username);
        } else {
          users.push(user.username);
          nextUsers.push(`${user.username} - ${daysAgo(user.lastSubmit)}`);
        }
      });
      return scriptFunction('refresh', [users, nextUsers]);
    });
  });
};

function daysAgo(lastSubmit) {
  if (lastSubmit) {
    const today = new Date();
    lastSubmit.setHours(0, 0, 0, 0);
    const daysDiff = Math.floor((today - lastSubmit) / (24 * 60 * 60 * 1000));
    if (daysDiff < 1) {
      return ('Today');
    } else if (daysDiff === 1) {
      return ('Yesterday');
    }
    return (`${daysDiff} days ago`);
  }
  return ('Never');
}

//
// Google Script API related functions

const { google } = require('googleapis');
const googleClient = require('./keys/googleClientKey.json');

const oauth2Client = new google.auth.OAuth2(
  googleClient.client_id,
  googleClient.client_secret,
  googleClient.redirect_uris
);

let oauthTokens = null;
const script = google.script('v1');
const scriptId = 'MYMsBbjHC6NN37LwMegmeuj5Vpmfnj_hu';

function authorize() {
  // Check if we have previously stored a token.
  return new Promise((resolve, reject) => {
    if (!oauthTokens) {
      return db.collection('biblebot').doc('api_tokens').get()
        .then((snapshot) => {
          oauthTokens = snapshot.data();
          oauth2Client.setCredentials(oauthTokens);
          return resolve(oauth2Client);
        })
        .catch(() => reject());
    }
    return resolve(oauth2Client);
  });
}

function callAppsScript(auth, setting) {
  // Make the API request. The request object is included here as 'resource'.
  return script.scripts.run(setting, (err, resp) => {
    if (err) {
      // The API encountered a problem before the script started executing.
      console.log(`The API returned an error: ${err}`);
      return;
    }
    if (resp.error) {
      // The API executed, but the script returned an error.

      // Extract the first (and only) set of error details. The values of this
      // object are the script's 'errorMessage' and 'errorType', and an array
      // of stack trace elements.
      const error = resp.error.details[0];
      console.log(`Script error message: ${error.errorMessage}`);
      console.log('Script error stacktrace:');

      if (error.scriptStackTraceElements) {
        // There may not be a stacktrace if the script didn't start executing.
        for (let i = 0; i < error.scriptStackTraceElements.length; i += 1) {
          const trace = error.scriptStackTraceElements[i];
          console.log('\t%s: %s', trace.function, trace.lineNumber);
        }
      }
    }
  });
}

function scriptFunction(functionName, functionParameters) {
  let params = functionParameters;
  if (!Array.isArray(params)) {
    params = [functionParameters];
  }
  console.log(`Script Function - ${functionName} : ${params}`);
  return authorize().then(auth => callAppsScript(auth, {
    auth,
    scriptId,
    resource: {
      function: functionName,
      parameters: params,
      devMode: false,
    },
  })).catch((error) => {
    console.log(error);
  });
}
