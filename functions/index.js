// TODO: Handle currency that is not Maloti
// TODO: Handle stock that we don't sell
// TODO: Handle pricing of stock
'use strict';

// const accounting = require('./accounting.js');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { WebhookClient } = require('dialogflow-fulfillment');

process.env.DEBUG = 'dialogflow:*'; // enables lib debugging statements
admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

let lastTransactionID = 0;
const stock = ['apples', 'oranges'];

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });

  const recordSaleOrPurchase = (agent) => {
    // Get parameters from Dialogflow with the string to add to the database
    const record = {
      date: agent.parameters.date,
      action: agent.parameters.action,
      items: agent.parameters.items,
      amount: agent.parameters.amount,
      company: agent.parameters.company
    };

    const transaction = classifyAccounts(record);

    const document = 'trans' + transaction.id;

    saveToDatabase(agent, 'Transactions', document, transaction)
      .then(agent.add(summarizeTransaction(transaction)))
      .catch(error => console.log(error));

    const items = record.items;
    const theItems = items.map(i => {
      return getItem(record, i);
    });
    theItems.forEach((item, index) => {
      saveToDatabase(agent, 'Inventory', document, item)
        .then(agent.add(`${record.items[index]} recorded in the stock`))
        .catch(error => console.log(error));
      lastTransactionID++;
    });
  };

  const showCash = async (agent) => {
    const transactions = await getCollection('Transactions');
    const debitCash = transactions.filter(t => { return t.dr_account === 'Cash'; });
    const creditCash = transactions.filter(t => { return t.cr_account === 'Cash'; });

    const drTotal = debitCash.length > 0
      ? debitCash.map(t => { return t.amount.amount; })
        .reduce((a, b) => { return a + b; }) : 0;

    const crTotal = creditCash.length > 0
      ? creditCash.map(t => { return t.amount.amount; })
        .reduce((a, b) => { return a + b; }) : 0;

    agent.add(`${drTotal - crTotal} Maloti`);
  };

  const viewInventory = async (agent) => {
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
  };

  const listTransactions = async (agent) => {
    const transactions = await getCollection('Transactions');
    let list = '';

    transactions.forEach(t => {
      const summary = summarizeTransaction(t).concat('\n\n');
      list = list.concat(summary);
    });
    agent.add(list);
  };

  const listDebtors = async (agent) => {
    const transactions = await getCollection('Transactions');
    const debt = new Map();
    let list = '';
    let debtors = transactions.filter(t => { return !['Sales', 'Purchases', 'Cash'].includes(t.dr_account); })
      .map(t => { return t.dr_account; });
    debtors = [...new Set(debtors)];

    transactions.forEach(t => {
      debtors.forEach((d) => {
        if (t.dr_account === d) {
          const newDebt = debt.get(d) ? debt.get(d) + t.amount.amount : t.amount.amount;
          debt.set(d, newDebt);
        }
      }
      );
    });

    debt.forEach((value, key, map) => {
      list = list.concat(`${key}: ${value} Maloti`);
    });
    agent.add(list);
  };

  const listCreditors = async (agent) => {
    const transactions = await getCollection('Transactions');
    const credit = new Map();
    let list = '';
    let creditors = transactions.filter(t => { return !['Sales', 'Purchases', 'Cash'].includes(t.cr_account); })
      .map(t => { return t.cr_account; });
    creditors = [...new Set(creditors)];
    transactions.forEach(t => {
      creditors.forEach((d) => {
        if (t.cr_account === d) {
          const newDebt = credit.get(d) ? credit.get(d) + t.amount.amount : t.amount.amount;
          credit.set(d, newDebt);
        }
      }
      );
    });

    credit.forEach((value, key, map) => {
      list = list.concat(`${key}: ${value} Maloti \n`);
    });
    agent.add(list);
  };

  // Map from Dialogflow intent names to functions to be run when the intent is matched
  const intentMap = new Map();
  // intentMap.set('ReadFromFirestore', readFromDb);
  intentMap.set('RecordSaleOrPurchase', recordSaleOrPurchase);
  intentMap.set('ShowCash', showCash);
  intentMap.set('ViewInventory', viewInventory);
  intentMap.set('ListTransactions', listTransactions);
  intentMap.set('ListDebtors', listDebtors);
  intentMap.set('ListCreditors', listCreditors);
  agent.handleRequest(intentMap);
});

const classifyAccounts = (record) => {
  let transaction = {
    id: (lastTransactionID + 1).toString()
  };
  if (record) {
    const isSales = record.action === 'sale';
    const accounts = [isSales ? 'Sales' : 'Purchases', !record.company ? 'Cash' : record.company
    ];
    transaction = Object.assign(transaction, {
      date: record.date,
      dr_account: isSales ? accounts[1] : accounts[0],
      cr_account: !isSales ? accounts[1] : accounts[0],
      amount: record.amount
    });
  }
  return transaction;
};

const saveToDatabase = (agent, collection, document, data) => {
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
};

const getCollection = async (collection) => {
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
};

const getItem = (record, item) => {
  const array = item.split(' ');
  return {
    number: parseInt(array[0]),
    item: validateItem(array[1]),
    direction: record.action === 'sold' ? 'out' : 'in'
  };
};

const summarizeTransaction = (transaction) => {
  return `${transaction.id}, ${transaction.date}, amount: ${transaction.amount.amount} ${transaction.amount.currency}, debit: ${transaction.dr_account}, credit: ${transaction.cr_account}`;
};

const validateItem = (item) => {
  if (stock.includes(item)) {
    return item;
  } else {
    if (item === 'apple' || item === 'apples') {
      return 'apples';
    } else {
      return 'oranges';
    }
  }
};
