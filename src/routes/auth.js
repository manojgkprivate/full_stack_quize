const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Register page
router.get('/register', (req, res) => {
    res.render('register');
});

// Login page
router.get('/login', (req, res) => {
    res.render('login');
});

// Register handle
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.render('register', { error: 'Email is already registered' });
        }

        // Create new user
        user = new User({
            username,
            email,
            password
        });

        await user.save();
        res.redirect('/auth/login');
    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Server error' });
    }
});

// Login handle
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('login', { error: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.render('login', { error: 'Invalid credentials' });
        }

        // Set session
        req.session.user = {
            id: user._id,
            username: user.username
        };
        
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Server error' });
    }
});

// Logout handle
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;