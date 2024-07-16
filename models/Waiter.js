const mongoose = require("mongoose");
const { Schema } = mongoose;

const RatingSchema = new Schema({
  rating: Number,
  rating_by: { type: Schema.Types.ObjectId, ref: "User" },
  date_time: { type: Date, default: Date.now },
});

const WaiterSchema = new Schema({
  restaurant_id: { type: Schema.Types.ObjectId, ref: "Restaurant" },
  name: String,
  picture: String,
  ratings: [RatingSchema],
});

const Waiter = mongoose.model("Waiter", WaiterSchema);

module.exports = Waiter;
