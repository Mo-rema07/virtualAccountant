/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// const accounting = require('./accounting.js');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { WebhookClient } = require('dialogflow-fulfillment');

process.env.DEBUG = 'dialogflow:*'; // enables lib debugging statements
admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

let lastTransactionID = 0;
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  function recordSaleOrPurchase (agent) {
    // Get parameters from Dialogflow with the string to add to the database
    const record = {
      date: agent.parameters.date,
      action: agent.parameters.action,
      item: agent.parameters.item,
      amount: agent.parameters.amount
    };

    const transaction = classifyAccounts(record);

    // Save the entries into their appropriate accounts.
    const account = transaction.accounts[0];
    saveToDatabase(agent, account, transaction.Id, transaction.entries[0])
      .then(agent.add(`${account} transaction has been saved to Firestore.`))
      .catch(error => console.log(error));
    const account1 = transaction.accounts[1];
    saveToDatabase(agent, account1, transaction.Id, transaction.entries[1])
      .then(agent.add(`${account1} transaction has been saved to Firestore`))
      .catch(error => console.log(error));

    let inventory = getInventory()
      .then(r => {
        return r;
      })
      .catch(error => console.log(error));

    const item = jsonifyItem(agent.parameters.item);

    inventory = inventory ? updateStock(agent.parameters.action, inventory, item) : item;

    saveToDatabase(agent, 'inventory', 'all', inventory)
      .then(() => agent.add('updated inventory'))
      .catch(error => { console.log(error); });

    agent.add(`${record.item}, ${record.date}, ${record.action}, ${record.amount} `);
  }
  function readFromDb (agent) {
    // Get the database collection 'dialogflow' and document 'agent'
    const dialogflowAgentDoc = db.collection('dialogflow').doc('agent');

    // Get the value of 'entry' in the document and send it to the user
    return dialogflowAgentDoc.get()
      .then(doc => {
        if (!doc.exists) {
          agent.add('No data found in the database!');
        } else {
          agent.add(doc.data().entry);
        }
        return Promise.resolve('Read complete');
      }).catch(() => {
        agent.add('Error reading entry from the Firestore database.');
        agent.add('Please add a entry to the database first by saying, "Write <your phrase> to the database"');
      });
  }

  // Map from Dialogflow intent names to functions to be run when the intent is matched
  const intentMap = new Map();
  intentMap.set('ReadFromFirestore', readFromDb);
  intentMap.set('RecordSaleOrPurchase', recordSaleOrPurchase);

  agent.handleRequest(intentMap);
});

function classifyAccounts (record) {
  let transaction = { Id: (lastTransactionID + 1).toString() };
  if (record) {
    transaction = Object.assign(transaction, { accounts: [
      checkSales(record) ? 'Sales' : 'Purchases',
      checkCash(record) ? 'Cash' : record.company
    ] });
    const entry = {
      transactionId: transaction.Id,
      date: record.date,
      account: transaction.accounts[1],
      dr_cr: checkSales(record) ? 'credit' : 'debit',
      amount: record.amount
    };
    const entry2 = {
      transactionId: transaction.Id,
      date: record.date,
      account: transaction.accounts[0],
      dr_cr: checkSales(record) ? 'debit' : 'credit',
      amount: record.amount
    };
    transaction = Object.assign(transaction, { entries: [entry, entry2] });
  }
  lastTransactionID++;
  return transaction;
}

function checkCash (record) {
  return !record.company;
}

function checkSales (record) {
  return record.action === 'sold';
}

function saveToDatabase (agent, collection, document, data) {
  const dialogflowAgentRef = db.collection(collection).doc(document);
  return db.runTransaction(t => {
    t.set(dialogflowAgentRef, data);
    return Promise.resolve('Write complete');
  }).then(doc => {
    agent.add(`${collection} record has been completed`);
    return doc;
  }).catch(err => {
    console.log(`Error writing to Firestore: ${err}`);
    agent.add('Saving Failed.');
  });
}

function getInventory () {
  const inventoryDoc = db.collection('inventory').doc('all');
  return inventoryDoc.get()
    .then(doc => {
      return Promise.resolve(doc.data());
    }).catch((e) => {
      console.log(e);
    });
}

function jsonifyItem (item) {
  const array = item.split();
  return {
    number: array[0],
    item: array[1]
  };
}

function updateStock (action, inventory, item) {
  if (action === 'sold') {
    inventory = item.item === 'oranges'
      ? Object.assign(inventory, { oranges: -item.number })
      : Object.assign(inventory, { apples: -item.number });
  } else {
    inventory = item.item === 'oranges'
      ? Object.assign(inventory, { oranges: item.number })
      : Object.assign(inventory, { apples: item.number });
  }
  return inventory;
}
