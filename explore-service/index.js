const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const db = require("./db");

const app = express();
app.use(express.json());
app.use(cors());

// Middleware to verify token
function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

// Updated explore route to load posts
app.get("/explore", authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        Post.postID,
        Post.caption,
        Post.createdAt,
        Place.placeID,
        Place.name AS placeName,
        Place.description AS placeDescription,
        Place.rating AS placeRating,
        Photo.photoID,
        Photo.imageURL,
        Photo.uploadDate
      FROM Post
      JOIN Place ON Post.placeID = Place.placeID
      JOIN Photo ON Post.photoID = Photo.photoID
      ORDER BY Post.createdAt DESC
    `;
    
    const [rows] = await db.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get a single post with full details
app.get("/explore/:postID", authenticateToken, async (req, res) => {
  const { postID } = req.params;

  try {
    const query = `
      SELECT 
        post.postID,
        post.caption,
        post.createdAt,
        place.placeID,
        place.name AS placeName,
        place.description AS placeDescription,
        place.rating AS placeRating,
        photo.photoID,
        photo.imageURL,
        photo.uploadDate
      FROM post
      LEFT JOIN place ON post.placeID = place.placeID
      LEFT JOIN photo ON post.photoID = photo.photoID
      WHERE post.postID = ?
    `;

    const [rows] = await db.query(query, [postID]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching post:", err);
    res.status(500).json({ error: err.message });
  }
});





app.listen(process.env.PORT, () => console.log(`Explore service running on port ${process.env.PORT}`));
