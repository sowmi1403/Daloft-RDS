// server.js
const express = require('express');
const session = require('express-session');
const mysql = require('mysql');
const path = require('path');
const bodyParser = require('body-parser');
const winston = require('winston');

const app = express();
const port = 4000;

// Database connection
const db = mysql.createConnection({
    host: 'database-1.cxcm8y6yc18a.ap-south-1.rds.amazonaws.com',
    user: 'root', // replace with your database username
    password: '123456789', // replace with your database password
    database: 'dataDB' // replace with your database name
});

// Connect to the database
db.connect((err) => {
    if (err) throw err;
    console.log('Connected to database');
});

// Set up logger with Winston
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console()
    ]
});

// Set up session middleware
app.use(session({
    secret: '123456789', // Use a strong secret key for session encryption
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' directory

// Route to render the login page
app.get('/login', (req, res) => {
    res.render('login'); // Render the login.ejs page
});

// Login route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    // Check hardcoded credentials
    if (username === 'testuser' && password === 'testpass') {
        // Store user information in session
        req.session.user = { username: username };
        logger.info(`User ${username} logged in`); // Log the login event
        res.redirect('/userlist'); // Redirect to user list after successful login
    } else {
        logger.warn('Invalid login attempt'); // Log invalid attempt
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Route to render the user list page
app.get('/userlist', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Redirect to login if not authenticated
    }
    res.render('userlist'); // Render the user list page
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Redirect to login if not authenticated
    }

    const userId = req.query.user_id; // Get user ID from query parameters

    // Fetch data from `received_data_new` for the specific user
    db.query('SELECT * FROM received_data_new WHERE user_id = ?', [userId], (err, userDataResults) => {
        if (err) {
            console.error('Error fetching user data:', err);
            return res.status(500).send('Server Error');
        }

        // Ensure we have at least one row of data
        if (userDataResults.length > 0) {
            const userData = userDataResults[0]; // Select the first row
            
            // Fetch coordinates from `coordinates_new` for the specific user
            db.query('SELECT latitude, longitude FROM coordinates_new WHERE user_id = ?', [userId], (err, coordinatesResults) => {
                if (err) {
                    console.error('Error fetching coordinates:', err);
                    return res.status(500).send('Server Error');
                }

                // Ensure we have at least one coordinate result
                const coordinates = coordinatesResults.length > 0 ? coordinatesResults[0] : {};

                // Pass the data to the dashboard template
                res.render('dashboard', { userData: userData, coordinates: coordinates });
            });
        } else {
            res.status(404).send('No data found for the specified user.');
        }
    });
});


let currentIndex = 0;
// Fetch user data one by one
app.get('/api/dashboard-data', (req, res) => {
    const userId = req.query.user_id; // Assuming user_id is passed in the query

    // Get total rows for the specific user
    db.query('SELECT COUNT(*) AS total FROM received_data_new WHERE user_id = ?', [userId], (error, countResults) => {
        if (error) {
            console.error('Error fetching total count:', error);
            return res.status(500).json({ error: 'Error fetching total count' });
        }

        const totalRows = countResults[0].total;
65.2.141.234
        // Fetch the current row based on currentIndex for this user
        db.query(`SELECT * FROM received_data_new WHERE user_id = ? LIMIT 1 OFFSET ${currentIndex}`, [userId], (error, results) => {
            if (error) {
                console.error('Error fetching data:', error);
                return res.status(500).json({ error: 'Error fetching data' });
            }
            const data = results[0] || {}; // Get the current row or an empty object

            // Update the currentIndex for the next fetch
            currentIndex = (currentIndex + 1) % totalRows; // Loop back to 0 if we reach the end

            // Send the fetched data as response
            res.json(data);
        });
    });
});

let coordinateIndex = 0;

// Fetch coordinates one by one or the latest for the user
app.get('/api/coordinates', (req, res) => {
    const userId = req.query.user_id;
    const fetchLatest = req.query.latest === 'true'; // Check if latest parameter is true

    if (fetchLatest) {
        // Fetch the latest coordinates from the database for the given user ID
        const query = 'SELECT latitude, longitude FROM location_data WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1';
        db.query(query, [userId], (err, results) => {
            if (err) {
                console.error('Error fetching latest coordinates:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (results.length > 0) {
                res.json(results[0]); // Send back the latest coordinates
            } else {
                res.json({ latitude: null, longitude: null }); // No data found
            }
        });
    } else {
        // Fetch total count of coordinates for the specific user
        db.query('SELECT COUNT(*) AS total FROM coordinates_new WHERE user_id = ?', [userId], (error, countResults) => {
            if (error) {
                console.error('Error fetching total count:', error);
                return res.status(500).json({ error: 'Error fetching total count' });
            }

            const totalRows = countResults[0].total;

            // Fetch the current coordinate based on coordinateIndex for this user
            db.query(`SELECT * FROM coordinates_new WHERE user_id = ? LIMIT 1 OFFSET ?`, [userId, coordinateIndex], (error, results) => {
                if (error) {
                    console.error('Error fetching coordinates:', error);
                    return res.status(500).json({ error: 'Error fetching coordinates' });
                }
                const coordinate = results[0]; // Get the current coordinate

                // Update the coordinateIndex for the next fetch
                coordinateIndex = (coordinateIndex + 1) % totalRows; // Loop back to 0 if we reach the end

                res.json(coordinate); // Send coordinate as a response
            });
        });
    }
});

app.post('/api/store-data', (req, res) => {
    console.log('Received data:', req.body); 

    const { user_id, data } = req.body; // Extract user_id and data from the request body

    if (!user_id || !Array.isArray(data)) {
        logger.warn('User ID or Data is missing/invalid');
        return res.status(400).json({ error: 'User ID and data are required, and data must be an array' });
    }

    // Prepare the SQL query to insert multiple rows
    const query = 'INSERT INTO received_data_new (user_id, A, B, C, D, E, F, received_at) VALUES ?';

    // Transform the data array into an array of values to be inserted
    const values = data.map(row => [user_id, row.A, row.B, row.C, row.D, row.E, row.F, new Date()]);

    // Perform the bulk insert query
    db.query(query, [values], (err, result) => {
        if (err) {
            logger.error('Error inserting bulk data into database:', err);
            return res.status(500).json({ error: 'Error inserting bulk data into database' });
        }

        logger.info('Bulk data inserted successfully:', result);
        res.status(200).json({ message: 'Bulk data stored successfully' });
    });
});



// Store coordinates endpoint with user_id and an array of locations
app.post('/api/coordinates', (req, res) => {
    console.log('Received data:', req.body); 

    const { user_id, locations } = req.body; // Extract user_id and locations from the request body

    if (!user_id || !Array.isArray(locations)) {
        logger.warn('User ID or Locations are missing/invalid');
        return res.status(400).json({ error: 'User ID and Locations are required, and Locations must be an array' });
    }

    // Prepare the SQL query to insert multiple coordinates
    const query = 'INSERT INTO coordinates_new (user_id, latitude, longitude) VALUES ?';
    
    // Transform the locations array into an array of values to be inserted
    const values = locations.map(location => {
        const [latitude, longitude] = location.split(',');
        return [user_id, latitude, longitude];
    });

    // Perform the bulk insert query
    db.query(query, [values], (err, result) => {
        if (err) {
            logger.error('Error inserting bulk data into database:', err);
            return res.status(500).json({ error: 'Error inserting bulk data into database' });
        }

        logger.info('Bulk coordinates inserted successfully:', result);
        res.status(200).json({ message: 'Bulk coordinates stored successfully' });
    });
});


// Serve the services page
app.get('/services', (req, res) => {
    res.render('services');  // Render services.ejs
});

// Serve the teams page
app.get('/teams', (req, res) => {
    res.render('teams');  // Render teams.ejs
});

// Serve the planner page
app.get('/planner', (req, res) => {
    res.render('planner');  // Render planner.ejs
});

// Serve the settings page
app.get('/settings', (req, res) => {
    res.render('settings');  // Render settings.ejs
});

// Serve the help page
app.get('/help', (req, res) => {
    res.render('help');  // Render help.ejs
});

//serve the signp page
app.get('/signup',(req,res) => {
    res.render('signup'); //Render signup.ejs
});

// Start the server
app.listen(port, () => {
    logger.info(`Server is running on http://localhost:${port}`);
});
