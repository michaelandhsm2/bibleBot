// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
// const serviceAccount = require('./keys/serviceAccountKey.json');

// Install related npm modules - npm install @line/bot-sdk cors axios -save
const cors = require('cors')({ origin: true });

admin.initializeApp();

const db = admin.firestore();

const webhookFunction = require('./webhook');
const webhook2Function = require('./webhook2');
const firestoreFunctions = require('./fsfunc');

exports.webhook = functions.https.onRequest((req, res) => {
  webhookFunction.handler(req, res, admin.firestore());
});

exports.webhook2 = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    webhook2Function.handler(req, res, admin.firestore());
  });
});

exports.postSubmitted = functions.firestore
  .document('posts/{postId}')
  .onCreate((snap, context) => {
    if ((Date.now() - Date.parse(context.timestamp)) > 15000) {
      console.log(`Dropping event 'postSubmitted' with age[ms]: ${(Date.now() - Date.parse(context.timestamp))}`);
      return;
    } else {
      return firestoreFunctions.postSubmitted(admin.firestore(), snap.data());
    }
});

exports.userWritten = functions.firestore.document('users/{userId}').onWrite(function(snap, context) {
  if ((Date.now() - Date.parse(context.timestamp)) > 15000) {
    console.log(`Dropping event 'userWritten' with age[ms]: ${(Date.now() - Date.parse(context.timestamp))}`);
    return;
  } else {
    return firestoreFunctions.formUpdate(admin.firestore());
  }
});

//
//
//

const { google } = require('googleapis');
const googleClient = require('./keys/googleClientKey.json');

const oauth2Client = new google.auth.OAuth2(
  googleClient.client_id,
  googleClient.client_secret,
  googleClient.redirect_uris
);
// const DB_TOKEN_PATH = '/api_tokens';


const SCOPES = ['https://www.googleapis.com/auth/forms', 'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/script.scriptapp'];

// visit the URL for this Function to obtain tokens
exports.authGoogleAPI = functions.https.onRequest((req, res) =>
  res.redirect(oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })));

// after you grant access, you will be redirected to the URL for this Function
// this Function stores the tokens to your Firebase database
exports.OauthCallback = functions.https.onRequest((req, res) => {
  console.log(JSON.stringify(req.query));
  const { code } = req.query;
  oauth2Client.getToken(code, (err, tokens) => {
    // Now tokens contains an access_token and an optional refresh_token. Save them.
    if (err) {
      console.log(JSON.stringify(err));
      return res.status(400).send(err);
    }

    return db.collection('biblebot').doc('api_tokens').set(tokens).then(() => res.status(200).send('OK'));
  });
});
