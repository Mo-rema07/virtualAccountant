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
    // console.log(agent.parameters)
    // const date = agent.parameters.date
    // const amount = agent.parameters.unit_currency
    // const action = agent.parameters.Action
    // const account = agent.parameters.Account

    // const record = {
    //   'date' : date,
    //   'amount': amount,
    //   'action': action,
    //   'account': account
    // }
    const record = {
      date : 'Today',
      amount: '5 USD',
      action: 'sold',
      account: 'books'
    }

    let transRef = db.collection('transactions').doc('transaction1');

    let setRecord = transRef.set(record)

    console.log(record)
    // db.collection('transactions').add(record).then(r => console.log(r))
    let docRef = db.collection('transactions').doc('1stRecord')
    // let setRecord = docRef.set(record)
    agent.add(`Recording new transaction`)
    return db.runTransaction(
      transaction => {
        transaction.set(docRef,record)
      })
      .then(() => {
        return "write success!"
      })
  }

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Record transaction', recordTransaction);
  agent.handleRequest(intentMap);
  // recordTransaction(agent);

});
