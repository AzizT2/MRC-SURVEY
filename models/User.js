const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the user schema
const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["normal", "admin"],
    default: "normal",
  },
});

// Create the User model
const User = mongoose.model("User", userSchema);

module.exports = User;
