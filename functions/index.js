// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const admin = require('firebase-admin');
admin.initializeApp();
let db = admin.firestore();

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  function welcome (agent) {
    agent.add(`Welcome to your own personal virtual assistant! How can I help you?`);
  }

  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }

  function recordTransaction(agent){
    const date = agent.parameters.date
    let transRef = db.collection('users').doc('transaction2');
    agent.add(`created reference`)
    // const amount = agent.parameters.unit_currency
    // const action = agent.parameters.Action
    // const account = agent.parameters.Account

    const record = {
      date : date
    }
    //   'amount': amount,
    //   'action': action,
    //   'account': account
    // }
    let setRecord = transRef.set(record)
    agent.add(`set the record straight`)
    agent.add(`Recording the transaction made on ${date}`)
    // Get parameter from Dialogflow with the string to add to the database
   

    // Get the database collection 'dialogflow' and document 'agent' and store
    // the document  {entry: "<value of database entry>"} in the 'agent' document
  }

  // function makeRecord(agent){
  //   agent.add(`entered makeRecord`)
  //
  // }

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Record transaction', recordTransaction);
  agent.handleRequest(intentMap);

});
