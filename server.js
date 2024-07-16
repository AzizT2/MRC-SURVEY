const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const port = 3000;
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const session = require("express-session");
const flash = require("express-flash");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const Restaurant = require("./models/Restaurant");
const Waiter = require("./models/Waiter");
const multer = require("multer");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/waiters"); // Upload directory for waiters' pictures
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Generate unique filename
  },
});

// Initialize multer with storage configuration
const upload = multer({ storage: storage });

const uploadDir = path.join(__dirname, "public", "uploads", "waiters");

// Ensure the directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

mongoose
  .connect("mongodb://localhost:27017/rate_restaurant", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.set("view engine", "ejs");

// Set the views directory
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "my-secret-key",
    resave: true,
    saveUninitialized: true,
  })
);

// Flash middleware
app.use(flash());

// Define a route handler for the default home page
app.get("/", async (req, res) => {
  try {
    const restaurants = await Restaurant.find(); // Fetch all restaurants
    res.render("index", { restaurants, user: req.session.user }); // Render 'home' view with restaurants data
  } catch (error) {
    console.error("Error fetching restaurants:", error);
    res.status(500).send("Error fetching restaurants");
  }
});

app.get("/login", (req, res) => {
  if (req.session.user) {
    res.redirect("/");
  } else {
    res.render("login");
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if user exists in the database
    const user = await User.findOne({ username });
    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/login");
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      req.flash("error", "Incorrect password");
      return res.redirect("/login");
    }

    // Save user in session
    req.session.user = user;

    // Redirect based on user role
    if (user.role === "admin") {
      res.redirect("/admin");
    } else {
      res.redirect("/");
    }
  } catch (error) {
    // Handle error
    req.flash("error", "Error logging in: " + error.message);
    res.redirect("/login");
  }
});

app.get("/register", (req, res) => {
  if (req.session.user) {
    res.redirect("/");
  } else {
    res.render("register");
  }
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      req.flash("error", "Username is already taken");
      return res.redirect("/register");
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user with hashed password
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    // Flash message on successful registration
    req.flash("success", "User registered successfully");

    // Redirect to registration page with flash message
    res.redirect("/register");
  } catch (error) {
    // Flash message on error
    req.flash("error", "Error registering user: " + error.message);

    // Redirect to registration page with flash message
    res.redirect("/register");
  }
});

app.get("/admin", (req, res) => {
  res.redirect("admin/restaurants");
});

app.get("/admin/restaurants", async (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else if (req.session.user.role != "admin") {
    res.redirect("/");
  }
  try {
    const restaurants = await Restaurant.find();
    res.render("admin/restaurant", {
      restaurants,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (error) {
    req.flash("error", "Error fetching restaurants: " + error.message);
    res.redirect("/admin");
  }
});

app.get("/admin/restaurants/new", (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else if (req.session.user.role != "admin") {
    res.redirect("/");
  }
  res.render("admin/add_restaurant");
});

app.post("/admin/restaurants/new", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  } else if (req.session.user.role !== "admin") {
    return res.redirect("/");
  }

  const { name } = req.body;

  try {
    // Check if restaurant already exists
    const existingRestaurant = await Restaurant.findOne({ name });
    if (existingRestaurant) {
      req.flash("error", "Restaurant name already exists.");
      return res.redirect("/admin/restaurants/new");
    }

    // Create a new restaurant
    const newRestaurant = new Restaurant({ name });

    // Generate QR code and save its data to the restaurant
    const qrCodeData = `http://localhost:3000/restaurants/${newRestaurant._id}`;
    const qrCodeFileName = `qr_${newRestaurant._id}.png`; // Unique filename based on restaurant ID
    const qrCodeFilePath = path.join(
      __dirname,
      "public",
      "images",
      "qrcodes",
      qrCodeFileName
    );

    // Generate QR code image
    await QRCode.toFile(qrCodeFilePath, qrCodeData);

    // Save filename to the restaurant schema
    newRestaurant.qrCode = qrCodeFileName;

    // Save restaurant to MongoDB
    await newRestaurant.save();

    // Flash message on successful registration
    req.flash("success", "Restaurant added successfully.");
    res.redirect("/admin/restaurants/new");
  } catch (error) {
    // Flash message on error
    req.flash("error", "Error adding restaurant: " + error.message);
    res.redirect("/admin/restaurants/new");
  }
});

app.get("/admin/restaurants/:restaurantId/waiters/new", (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else if (req.session.user.role != "admin") {
    res.redirect("/");
  }
  const restaurantId = req.params.restaurantId;
  // Render a form or perform other actions to add waiters
  res.render("admin/add_waiter.ejs", { restaurantId });
});

app.get("/admin/waiters", async (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else if (req.session.user.role != "admin") {
    res.redirect("/");
  }
  try {
    const waiters = await Waiter.find().populate("restaurant_id", "name");
    // res.json({'waiters': waiters});
    res.render("admin/waiters", { waiters: waiters }); // Render 'waiters' view with waiters data
  } catch (error) {
    console.error("Error fetching waiters:", error);
    res.status(500).send("Error fetching waiters");
  }
});

app.post("/admin/waiters/save", async (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else if (req.session.user.role != "admin") {
    res.redirect("/");
  }
  upload.single("picture")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      return res.status(500).send("File upload error: " + err.message);
    } else if (err) {
      // An unknown error occurred
      return res.status(500).send("Error: " + err.message);
    }

    try {
      const { name, restaurant_id } = req.body;
      const picture = req.file.filename; // Filename saved by multer

      // Check if restaurant exists
      const restaurant = await Restaurant.findById(restaurant_id);
      if (!restaurant) {
        return res.status(404).send("Restaurant not found");
      }

      // Create a new waiter instance
      const newWaiter = new Waiter({
        restaurant_id: restaurant_id,
        name: name,
        picture: picture,
        ratings: [], // Initialize with empty ratings array
      });

      // Save waiter to the database
      await newWaiter.save();

      req.flash("success", "Waiter added successfully");

      // Redirect or send response
      res.redirect(`/admin/restaurants/${restaurant_id}/waiters/new`);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error adding waiter");
    }
  });
});

app.get("/admin/restaurants/:restaurantId/delete", async (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else if (req.session.user.role != "admin") {
    res.redirect("/");
  }
  const { restaurantId } = req.params;

  try {
    // Find all waiters belonging to the restaurant
    const waiters = await Waiter.find({ restaurant_id: restaurantId });

    // Loop through waiters and delete their pictures and records
    await Promise.all(
      waiters.map(async (waiter) => {
        // Delete waiter's picture
        const picturePath = path.join(
          __dirname,
          "../public/uploads/waiters",
          waiter.picture
        );
        await fs.promises.unlink(picturePath).catch((err) => {
          if (err.code !== "ENOENT") {
            console.error("Error deleting picture:", err);
          }
        });

        // Delete waiter record
        await Waiter.findByIdAndDelete(waiter._id);
      })
    );

    // Delete the restaurant itself
    await Restaurant.findByIdAndDelete(restaurantId);

    res.redirect("/admin/restaurants"); // Redirect to restaurants list page after deletion
  } catch (error) {
    console.error("Error deleting restaurant and associated waiters:", error);
    res.status(500).send("Error deleting restaurant and associated waiters");
  }
});

app.get("/admin/waiters/:waiterId/delete", async (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else if (req.session.user.role != "admin") {
    res.redirect("/");
  }
  const { waiterId } = req.params;

  try {
    // Find the waiter by ID to get the picture filename
    const waiter = await Waiter.findById(waiterId);
    if (!waiter) {
      return res.status(404).send("Waiter not found");
    }

    // Delete the waiter's picture from uploads/waiters folder
    // const picturePath = path.join(
    //   __dirname,
    //   "uploads/waiters",
    //   waiter.picture
    // );
    fs.unlink("public/uploads/waiters/" + waiter.picture, async (err) => {
      if (err && err.code !== "ENOENT") {
        console.error("Error deleting picture:", err);
        return res.status(500).send("Error deleting waiter's picture");
      }

      // Now delete the waiter record from the database
      await Waiter.findByIdAndDelete(waiterId);
      res.redirect("/admin/waiters"); // Redirect to waiters list page after deletion
    });
  } catch (error) {
    console.error("Error deleting waiter:", error);
    res.status(500).send("Error deleting waiter");
  }
});

app.get("/restaurants/:id", async (req, res) => {
  const restaurantId = req.params.id;

  try {
    // Fetch restaurant details from MongoDB
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).send("Restaurant not found");
    }

    // Fetch all waiters for this restaurant
    let waiters = await Waiter.find({ restaurant_id: restaurantId });
    waiters = waiters.map((waiter) => {
      let totalRating = 0;
      waiter.ratings.forEach((rating) => {
        totalRating += rating.rating;
      });

      const averageRating = waiter.ratings.length
        ? Math.round(totalRating / waiter.ratings.length) + " / 100"
        : 0;

      return {
        ...waiter.toObject(), // Convert Mongoose document to plain JavaScript object
        average_rating: averageRating,
      };
    });
    let totalRating = 0;
    restaurant.ratings.forEach((rating) => {
      totalRating += rating.rating;
    });

    const averageRating = restaurant.ratings.length
      ? Math.round(totalRating / restaurant.ratings.length) + " / 100"
      : "No ratings yet";

    // Render the restaurant details view (e.g., restaurant.ejs) with restaurant and waiters data
    res.render("restaurant", {
      restaurant,
      waiters,
      averageRating,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Error fetching restaurant details:", error);
    res.status(500).send("Error fetching restaurant details");
  }
});

app.get("/restaurant/:restaurantId/rate/:rating", async (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
  } else {
    const { restaurantId, rating } = req.params;
    const userId = req.session.user._id;

    try {
      // Find the restaurant
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        req.flash("error", "Restaurant not found");
        return res.redirect("/");
      }

      // Check if the user has already rated the restaurant
      const existingRating = restaurant.ratings.find(
        (r) => r.rating_by.toString() === userId.toString()
      );
      if (existingRating) {
        req.flash("error", "You have already rated this restaurant");
        return res.redirect(`/restaurants/${restaurantId}`);
      }

      // Create a new rating and add it to the restaurant
      const newRating = {
        rating: parseInt(rating, 10),
        rating_by: userId,
        date_time: new Date(),
      };

      restaurant.ratings.push(newRating);
      await restaurant.save();

      req.flash("success", "Thank you for rating this restaurant");
      res.redirect(`/restaurants/${restaurantId}`);
    } catch (error) {
      console.error("Error rating restaurant:", error);
      req.flash("error", "Error rating restaurant");
      res.redirect(`/restaurants/${restaurantId}`);
    }
  }
});

app.get(
  "/waiter/:waiterId/rate/:rating/restaurant/:restaurantId",
  async (req, res) => {
    if (!req.session.user) {
      res.redirect("/login");
    } else {
      const { waiterId, rating, restaurantId } = req.params;
      const userId = req.session.user._id; // Assuming user ID is stored in the session

      try {
        // Find the waiter by ID
        const waiter = await Waiter.findById(waiterId);

        if (!waiter) {
          return res.status(404).send("Waiter not found");
        }

        // Check if the user has already rated this waiter
        const existingRating = waiter.ratings.find(
          (r) => r.rating_by.toString() === userId.toString()
        );

        if (existingRating) {
          // Update existing rating
          existingRating.rating = rating;
          existingRating.date_time = new Date();
        } else {
          // Add new rating
          waiter.ratings.push({
            rating: rating,
            rating_by: userId,
            date_time: new Date(),
          });
        }

        // Save the updated waiter
        await waiter.save();

        res.redirect(`/restaurants/${restaurantId}`); // Adjust the redirect as necessary
      } catch (error) {
        console.error("Error rating waiter:", error);
        res.status(500).send("Error rating waiter");
      }
    }
  }
);

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Error logging out");
    }
    // Redirect to the login page or any other page
    res.redirect("/login"); // Replace with your desired redirect URL
  });
});

app.get("/backup", async (req, res) => {
  try {
    // Fetch data from MongoDB for all models
    const restaurants = await Restaurant.find().lean(); // Convert Mongoose documents to plain JavaScript objects
    const users = await User.find().lean();
    const waiters = await Waiter.find().lean();

    // Create backup directory if it doesn't exist
    const backupDir = path.join(__dirname, "backup");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    // Save data as JSON files in the backup directory
    const restaurantBackupPath = path.join(backupDir, "restaurants.json");
    fs.writeFileSync(
      restaurantBackupPath,
      JSON.stringify(restaurants, null, 2)
    );

    const usersBackupPath = path.join(backupDir, "users.json");
    fs.writeFileSync(usersBackupPath, JSON.stringify(users, null, 2));

    const waitersBackupPath = path.join(backupDir, "waiters.json");
    fs.writeFileSync(waitersBackupPath, JSON.stringify(waiters, null, 2));

    console.log("Backup created successfully:");
    console.log("- Restaurants:", restaurantBackupPath);
    console.log("- Users:", usersBackupPath);
    console.log("- Waiters:", waitersBackupPath);

    res.status(200).send("Backup created successfully!");
  } catch (error) {
    console.error("Error creating backup:", error);
    res.status(500).send("Error creating backup");
  }
});

app.get("/loadbackup", async (req, res) => {
  try {
    // Check if any documents exist in any of the collections
    const restaurantCount = await Restaurant.countDocuments();
    const userCount = await User.countDocuments();
    const waiterCount = await Waiter.countDocuments();

    if (restaurantCount > 0 || userCount > 0 || waiterCount > 0) {
      res.send(
        "Data already exists in the database. Skipping loading backup data."
      );
      return;
    }

    // Read data from backup files
    const backupFolderPath = path.join(__dirname, "backup");
    const restaurantData = JSON.parse(
      fs.readFileSync(path.join(backupFolderPath, "restaurants.json"), "utf8")
    );
    const userData = JSON.parse(
      fs.readFileSync(path.join(backupFolderPath, "users.json"), "utf8")
    );
    const waiterData = JSON.parse(
      fs.readFileSync(path.join(backupFolderPath, "waiters.json"), "utf8")
    );

    // Insert backup data into MongoDB collections
    await Restaurant.insertMany(restaurantData);
    await User.insertMany(userData);
    await Waiter.insertMany(waiterData);

    res.send("Backup data loaded successfully.");
  } catch (error) {
    res.send("Error loading backup data:", error);
  }
});

// Start the server and listen on port 3000
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
