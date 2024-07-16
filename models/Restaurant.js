const mongoose = require("mongoose");
const { Schema } = mongoose;

const RatingSchema = new Schema({
  rating: Number,
  rating_by: { type: Schema.Types.ObjectId, ref: "User" },
  date_time: { type: Date, default: Date.now },
});

const RestaurantSchema = new Schema({
  name: String,
  ratings: [RatingSchema],
  qrCode: String, // Field to store QR code data (URL or path)
});

const Restaurant = mongoose.model("Restaurant", RestaurantSchema);

module.exports = Restaurant;
