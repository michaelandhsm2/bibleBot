// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
var admin = require("firebase-admin");
var serviceAccount = require("./keys/serviceAccountKey.json");

// Install related npm modules - npm install @line/bot-sdk cors axios -save
const axios = require('axios');
const cors = require('cors')({
  origin: true
});




admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://biblebot-f4704.firebaseio.com"
});

const dbRef = admin.database().ref();
const dbFireStore = admin.firestore();

const webhookFunction = require('./webhook');
const webhook2Function = require('./webhook2');


exports.webhook = functions.https.onRequest((req, res) => {
    webhookFunction.handler(req, res, admin.database());
});

exports.webhook2 = functions.https.onRequest((req, res) => {
    webhook2Function.handler(req, res, admin.database(), dbFireStore);
});


// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //
// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //
// // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // // //


var {google} = require('googleapis');
var googleClient = require('./keys/googleClientKey.json');
const oauth2Client = new google.auth.OAuth2(googleClient.client_id, googleClient.client_secret, googleClient.redirect_uris);
const DB_TOKEN_PATH = '/api_tokens';


const SCOPES = ['https://www.googleapis.com/auth/forms'];

// visit the URL for this Function to obtain tokens
exports.authGoogleAPI = functions.https.onRequest((req, res) =>
  res.redirect(oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  }))
);

// after you grant access, you will be redirected to the URL for this Function
// this Function stores the tokens to your Firebase database
exports.OauthCallback = functions.https.onRequest((req, res) => {
  console.log(JSON.stringify(req.query));
  const code = req.query.code;
  oauth2Client.getToken(code, (err, tokens) => {
    // Now tokens contains an access_token and an optional refresh_token. Save them.
    if (err) {
      console.log(JSON.stringify(err));
      return res.status(400).send(err);
    }
    return dbRef.child(DB_TOKEN_PATH).set(tokens).then(() => res.status(200).send('OK'));
  });
});
