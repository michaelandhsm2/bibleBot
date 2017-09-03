// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
var admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");

// Install related npm modules - npm install @line/bot-sdk cors axios -save
const line = require('@line/bot-sdk');
const axios = require('axios');
const cors = require('cors')({
    origin: true
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://biblebot-f4704.firebaseio.com"
});
