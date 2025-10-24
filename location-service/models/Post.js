// backend/models/Post.js
const mongoose = require("mongoose");

const PointSchema = new mongoose.Schema(
  { lat: Number, lng: Number },
  { _id: false }
);

const PostSchema = new mongoose.Schema({
  postId: { type: Number, required: true }, // ✅ Use Number
  path: [PointSchema],
});

module.exports = mongoose.model("Post", PostSchema);
