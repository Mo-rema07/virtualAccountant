// const lastTransactionID = 0;
// function classifyAccounts (record) {
//   let transaction = {};
//   if (record) {
//     let entry;
//     let entry2;
//     transaction = Object.assign(transaction, { accounts: [
//       checkSales ? 'Sales' : 'Purchases',
//       checkCash ? 'Cash' : record.company
//     ] });
//     entry = {
//       transactionId: lastTransactionID + 1,
//       date: record.date,
//       account: transaction.accounts[0],
//       dr_cr: checkSales ? 'credit' : 'debit',
//       amount: record.amount
//     };
//     entry2 = {
//       transactionId: lastTransactionID + 1,
//       date: record.date,
//       account: transaction.accounts[1],
//       dr_cr: checkSales ? 'debit' : 'credit',
//       amount: record.amount
//     };
//     transaction = Object.assign(transaction, { entries: [entry, entry2] });
//   }
//   return transaction;
// }
//
// function checkCash (record) {
//   return !record.company;
// }
//
// function checkSales (record) {
//   return record.action === 'sold';
// }
//
// exports = classifyAccounts();
