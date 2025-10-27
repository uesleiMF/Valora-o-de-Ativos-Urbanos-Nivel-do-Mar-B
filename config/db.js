const mongoose = require('mongoose');
const connectDB = async (uri) => {
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('MongoDB conectado');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
module.exports = connectDB;
