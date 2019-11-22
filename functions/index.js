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
// TODO: Differentiate rupee/dolars etc.
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
      amount: agent.parameters.amount,
      company: agent.parameters.company
    };

    const transaction = classifyAccounts(record);

    // Save the entries into their appropriate accounts.
    const account = transaction.accounts[0];
    saveToDatabase(agent, account, transaction.Id, transaction.entries[0])
      .then(agent.add(`${account} entry has been saved.`))
      .catch(error => console.log(error));

    const account1 = transaction.accounts[1];
    saveToDatabase(agent, account1, transaction.Id, transaction.entries[1])
      .then(agent.add(`${account1} entry has been saved.`))
      .catch(error => console.log(error));

    const item = getItem(record);
    saveToDatabase(agent, 'Inventory', transaction.Id, item)
      .then(agent.add(`${record.item} recorded in the stock`))
      .catch(error => console.log(error));
  }

  async function showCash (agent) {
    const results = await getCollection('Cash');
    let sum = 0;
    results.forEach(doc => {
        sum = doc.dr_cr === 'debit' ? sum + doc.amount.amount : sum - doc.amount.amount;
      }
    );
    agent.add(`${sum} Maloti`);
  }

  async function viewInventory (agent) {
    const results = await getCollection('Inventory');
    let apples = 0;
    let oranges = 0;
    results.forEach(result => {
      if (result.item === 'apples') {
        apples = result.direction === 'in' ? apples + result.number : apples - result.number;
      } else {
        oranges = result.direction === 'in' ? oranges + result.number : oranges - result.number;
      }
    });
    const stock = new Map();
    stock.set('apples', apples);
    stock.set('oranges', oranges);

    const fruit = agent.parameters.fruit;
    if (fruit) {
      agent.add(`There are ${stock.get(fruit)} ${fruit}`);
    } else {
      agent.add(`There are ${stock.get('apples')} apple(s) and ${stock.get('oranges')} orange(s)`);
    }
  }

  async function listTransactions(agent){
    let allCollections = []
    let entries = []
    await db.listCollections().then(collections => {
      for (let collection of collections) {
        allCollections.push(collection.id)
      }
      return null;
    })
    allCollections.forEach( async collection => {
      let newEntry = await getCollection(collection)
      console.log(newEntry)
      entries.concat(newEntry)
    })
      .then(()=>{
        console.log(allCollections)
        console.log(entries)
        return null
      })
      .catch(e=>console.log(e))
  }

  // Map from Dialogflow intent names to functions to be run when the intent is matched
  const intentMap = new Map();
  // intentMap.set('ReadFromFirestore', readFromDb);
  intentMap.set('RecordSaleOrPurchase', recordSaleOrPurchase);
  intentMap.set('ShowCash', showCash);
  intentMap.set('ViewInventory', viewInventory);
  intentMap.set('ListTransactions', listTransactions);
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

async function getCollection (collection) {
  const results = [];
  const collectionRef = db.collection(collection);
  await collectionRef.get()
  // eslint-disable-next-line promise/always-return
    .then(snapshot => {
      snapshot.forEach(doc => {
        results.push(doc.data());
      });
    })
    .catch(err => {
      console.log('Error getting documents', err);
    });
  return results;
}

function getItem (record) {
  const array = record.item.split(' ');
  return {
    number: parseInt(array[0]),
    item: array[1],
    direction: checkSales(record) ? 'out' : 'in'
  };
}
