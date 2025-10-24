// backend/seed.js
const connectDB = require("./db");
const Post = require("./models/Post");

const seedData = async () => {
  try {
    await connectDB();

    // delete old data
    await Post.deleteMany({});

    // insert sample posts
    const posts = [
  {
    postId: "1",
    path: [
      { lat: 6.9271, lng: 79.8612 },
      { lat: 6.9285, lng: 79.864 },
      { lat: 6.93, lng: 79.8655 },
    ],
  },
  {
    postId: "2",
    path: [
      { lat: 6.9147, lng: 79.9723 },
      { lat: 6.9155, lng: 79.97 },
      { lat: 6.916, lng: 79.968 },
    ],
  },
];


    await Post.insertMany(posts);
    console.log("✅ Demo data inserted successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error inserting data:", err);
    process.exit(1);
  }
};

seedData();
