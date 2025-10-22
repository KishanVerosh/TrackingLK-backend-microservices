// index.js (app-server)
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
require("dotenv").config();
const db = require("./db");

const app = express();
app.use(express.json());
app.use(cors());

// Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
// 🔐 Middleware: Verify JWT
// =======================
function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

// =======================
// Multer setup for photo uploads
// =======================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// =======================
// Explore routes
// =======================
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
    console.error("❌ Explore fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

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
    if (!rows.length) return res.status(404).json({ message: "Post not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Post fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// Profile routes
// =======================
app.post("/profile/create", async (req, res) => {
  const { userID, fullName } = req.body;
  if (!userID) return res.status(400).json({ message: "userID is required" });
  try {
    await db.query("INSERT INTO profiles (userID, fullName) VALUES (?, ?)", [userID, fullName || null]);
    res.json({ message: "Profile created successfully" });
  } catch (err) {
    console.error("❌ Profile creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/profile/me", authenticateToken, async (req, res) => {
  try {
    const userID = req.user.userID;
    const [rows] = await db.query("SELECT * FROM profiles WHERE userID = ?", [userID]);
    if (!rows.length) return res.status(404).json({ message: "Profile not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/profile/me", authenticateToken, async (req, res) => {
  try {
    const userID = req.user.userID;
    const { fullName, bio, location, birthDate, gender } = req.body;
    const updates = [];
    const values = [];

    if (fullName !== undefined) { updates.push("fullName = ?"); values.push(fullName); }
    if (bio !== undefined) { updates.push("bio = ?"); values.push(bio); }
    if (location !== undefined) { updates.push("location = ?"); values.push(location); }
    if (birthDate !== undefined) { updates.push("birthDate = ?"); values.push(birthDate); }
    if (gender !== undefined) { updates.push("gender = ?"); values.push(gender); }

    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    values.push(userID);
    const sql = `UPDATE profiles SET ${updates.join(", ")} WHERE userID = ?`;
    await db.query(sql, values);
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("❌ Profile update error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/profile/me/photo", authenticateToken, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const fileUrl = `/uploads/${req.file.filename}`;
    const userID = req.user.userID;
    await db.query("UPDATE profiles SET photo = ? WHERE userID = ?", [fileUrl, userID]);
    res.json({ message: "Photo uploaded successfully", photo: fileUrl });
  } catch (err) {
    console.error("❌ Photo upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// Community routes
// =======================
app.get("/community/posts", authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.postID, p.content, p.image, p.createdAt, 
             pr.fullName, pr.photo as profilePhoto
      FROM posts p
      JOIN profiles pr ON p.profileID = pr.profileID
      ORDER BY p.createdAt DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/community/posts", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    const userID = req.user.userID;
    const [profile] = await db.query("SELECT profileID FROM profiles WHERE userID = ?", [userID]);
    if (!profile.length) return res.status(404).json({ message: "Profile not found" });

    const profileID = profile[0].profileID;
    const { content } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    const [result] = await db.query(
      "INSERT INTO posts (profileID, content, image) VALUES (?, ?, ?)",
      [profileID, content, image]
    );
    res.json({ message: "Post created", postID: result.insertId });
  } catch (err) {
    console.error("❌ Post creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/community/posts/:postID/comments", authenticateToken, async (req, res) => {
  try {
    const userID = req.user.userID;
    const [profile] = await db.query("SELECT profileID FROM profiles WHERE userID = ?", [userID]);
    if (!profile.length) return res.status(404).json({ message: "Profile not found" });

    const profileID = profile[0].profileID;
    const { comment } = req.body;
    const postID = req.params.postID;

    await db.query("INSERT INTO comments (postID, profileID, comment) VALUES (?, ?, ?)", [postID, profileID, comment]);
    res.json({ message: "Comment added" });
  } catch (err) {
    console.error("❌ Comment error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/community/posts/:postID/like", authenticateToken, async (req, res) => {
  try {
    const userID = req.user.userID;
    const [profile] = await db.query("SELECT profileID FROM profiles WHERE userID = ?", [userID]);
    if (!profile.length) return res.status(404).json({ message: "Profile not found" });

    const profileID = profile[0].profileID;
    const postID = req.params.postID;

    const [existing] = await db.query("SELECT * FROM likes WHERE postID = ? AND profileID = ?", [postID, profileID]);

    if (existing.length) {
      await db.query("DELETE FROM likes WHERE postID = ? AND profileID = ?", [postID, profileID]);
      res.json({ message: "Post unliked" });
    } else {
      await db.query("INSERT INTO likes (postID, profileID) VALUES (?, ?)", [postID, profileID]);
      res.json({ message: "Post liked" });
    }
  } catch (err) {
    console.error("❌ Like error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// Start server
// =======================
app.listen(process.env.PORT, () =>
  console.log(`App service running on port ${process.env.PORT}`)
);
