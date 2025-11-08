const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Bill = require('./models/bill');
const EventLog = require('./models/eventLog');

async function clearAllBills() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Delete all bills
    console.log('Deleting all bills...');
    const billsResult = await Bill.deleteMany({});
    console.log(`Deleted ${billsResult.deletedCount} bills`);

    // Delete all event logs
    console.log('Deleting all event logs...');
    const logsResult = await EventLog.deleteMany({});
    console.log(`Deleted ${logsResult.deletedCount} event logs`);

    console.log('✅ All bill data cleared successfully!');
    
  } catch (error) {
    console.error('❌ Error clearing bill data:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
clearAllBills();