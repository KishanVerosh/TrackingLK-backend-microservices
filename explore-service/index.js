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
    // Get profileID for the caller
    const userID = req.user.userID;
    const [profileRows] = await db.query("SELECT profileID FROM profiles WHERE userID = ?", [userID]);
    const profileID = profileRows.length ? profileRows[0].profileID : null;

    const [rows] = await db.query(
      `
      SELECT 
        p.postID,
        p.profileID,
        p.content,
        p.image,
        p.createdAt,
        pr.fullName,
        pr.photo AS profilePhoto,
        (SELECT COUNT(*) FROM likes l WHERE l.postID = p.postID) AS likeCount,
        (SELECT COUNT(*) FROM comments c WHERE c.postID = p.postID) AS commentCount,
        (SELECT COUNT(*) FROM likes l2 WHERE l2.postID = p.postID AND l2.profileID = ?) AS likedByMe
      FROM posts p
      JOIN profiles pr ON p.profileID = pr.profileID
      ORDER BY p.createdAt DESC
      `,
      [profileID] // used in the likedByMe subquery
    );

    // likedByMe comes as number (0 or 1) — convert to boolean
    const mapped = rows.map(r => ({ ...r, likedByMe: Boolean(r.likedByMe) }));

    res.json(mapped);
  } catch (err) {
    console.error("❌ Error fetching posts:", err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

app.get("/community/posts/:postID/comments", authenticateToken, async (req, res) => {
  try {
    const postID = req.params.postID;
    const [rows] = await db.query(
      `SELECT c.commentID, c.comment, c.createdAt, pr.profileID, pr.fullName, pr.photo AS profilePhoto
       FROM comments c
       JOIN profiles pr ON c.profileID = pr.profileID
       WHERE c.postID = ?
       ORDER BY c.createdAt ASC`,
      [postID]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Comments fetch error:", err);
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
    const postID = req.params.postID;
    const userID = req.user.userID;
    const [profile] = await db.query("SELECT profileID FROM profiles WHERE userID = ?", [userID]);
    if (!profile.length) return res.status(404).json({ message: "Profile not found" });
    const profileID = profile[0].profileID;
    const { comment } = req.body;
    if (!comment || !comment.trim()) return res.status(400).json({ message: "Comment cannot be empty" });

    const [result] = await db.query("INSERT INTO comments (postID, profileID, comment) VALUES (?, ?, ?)", [postID, profileID, comment.trim()]);
    res.json({ message: "Comment added", commentID: result.insertId });
  } catch (err) {
    console.error("❌ Comment add error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/community/posts/:postID/like", authenticateToken, async (req, res) => {
  try {
    const postID = req.params.postID;
    const userID = req.user.userID;
    const [profile] = await db.query("SELECT profileID FROM profiles WHERE userID = ?", [userID]);
    if (!profile.length) return res.status(404).json({ message: "Profile not found" });
    const profileID = profile[0].profileID;

    const [existing] = await db.query("SELECT * FROM likes WHERE postID = ? AND profileID = ?", [postID, profileID]);
    if (existing.length) {
      await db.query("DELETE FROM likes WHERE postID = ? AND profileID = ?", [postID, profileID]);
      return res.json({ message: "Unliked" });
    } else {
      await db.query("INSERT INTO likes (postID, profileID) VALUES (?, ?)", [postID, profileID]);
      return res.json({ message: "Liked" });
    }
  } catch (err) {
    console.error("❌ Like error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/profile/:id", authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.query(
      "SELECT profileID, userID, fullName,fullName AS username, photo FROM profiles WHERE profileID = ? OR userID = ? LIMIT 1",
      [id, id]
    );
    if (!rows.length) return res.status(404).json({ message: "Profile not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Profile fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/community/posts/:postID", authenticateToken, async (req, res) => {
  try {
    const postID = req.params.postID;
    const userID = req.user.userID;

    // get profileID for caller
    const [profiles] = await db.query("SELECT profileID FROM profiles WHERE userID = ?", [userID]);
    if (!profiles.length) return res.status(404).json({ message: "Profile not found" });
    const profileID = profiles[0].profileID;

    // get post owner
    const [posts] = await db.query("SELECT profileID FROM posts WHERE postID = ?", [postID]);
    if (!posts.length) return res.status(404).json({ message: "Post not found" });

    if (String(posts[0].profileID) !== String(profileID)) {
      return res.status(403).json({ message: "Not authorized to edit this post" });
    }

    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ message: "No content provided" });

    await db.query("UPDATE posts SET content = ? WHERE postID = ?", [content, postID]);
    res.json({ message: "Post updated successfully" });
  } catch (err) {
    console.error("❌ Post update error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/community/posts/:postID", authenticateToken, async (req, res) => {
  try {
    const postID = req.params.postID;
    const userID = req.user.userID;

    // get profileID for caller
    const [profiles] = await db.query("SELECT profileID FROM profiles WHERE userID = ?", [userID]);
    if (!profiles.length) return res.status(404).json({ message: "Profile not found" });
    const profileID = profiles[0].profileID;

    // get post owner
    const [posts] = await db.query("SELECT profileID, image FROM posts WHERE postID = ?", [postID]);
    if (!posts.length) return res.status(404).json({ message: "Post not found" });

    if (String(posts[0].profileID) !== String(profileID)) {
      return res.status(403).json({ message: "Not authorized to delete this post" });
    }

    // optional: remove related rows (comments, likes)
    await db.query("DELETE FROM comments WHERE postID = ?", [postID]);
    await db.query("DELETE FROM likes WHERE postID = ?", [postID]);

    // delete post
    await db.query("DELETE FROM posts WHERE postID = ?", [postID]);

    // optional: delete image file from uploads (if stored locally)
    /*
    try {
      const imagePath = posts[0].image;
      if (imagePath) {
        const fs = require("fs");
        const imgFile = path.join(__dirname, imagePath.replace(/^\//, ""));
        if (fs.existsSync(imgFile)) fs.unlinkSync(imgFile);
      }
    } catch (fsErr) {
      console.warn("Failed to remove post image file:", fsErr);
    }
    */

    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("❌ Post delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =======================
// Start server
// =======================
app.listen(process.env.PORT, () =>
  console.log(`App service running on port ${process.env.PORT}`)
);
