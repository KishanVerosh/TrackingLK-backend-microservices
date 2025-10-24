const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Post = require("./models/Post");
const connectDB = require("./db");

const app = express();
app.use(express.json());
app.use(cors());

// Connect to MongoDB
connectDB();

// ✅ Route to get one post's path data
app.get("/maps/:postID", async (req, res) => {
  try {
    const { postID } = req.params;

    // find post by postId (make sure type matches schema)
    const post = await Post.findOne({ postId: Number(postID) });

    if (!post) {
      return res.status(404).json({ message: `No path found for post ${postID}` });
    }

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 6000;
app.listen(PORT, () => console.log(`🚀 Server running on http://192.168.1.100:${PORT}`));
