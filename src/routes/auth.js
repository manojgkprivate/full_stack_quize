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
        // Redirect to home page after login
        res.redirect('/');
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

// Start Google OAuth (simple redirect to Google's consent screen if configured)
router.get('/google', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const base = process.env.BASE_URL || (`http://localhost:${process.env.PORT || 3000}`);
    if (!clientId) {
        // Not configured
        return res.redirect('/auth/register');
    }
    const redirectUriRaw = `${base}/auth/google/callback`;
    const redirectUri = encodeURIComponent(redirectUriRaw);
    const scope = encodeURIComponent('profile email');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&access_type=offline&prompt=consent`;

    // Helpful logs to debug redirect_uri_mismatch errors
    console.log('[Google OAuth] redirectUriRaw =', redirectUriRaw);
    console.log('[Google OAuth] redirect URI (encoded) =', redirectUri);
    console.log('[Google OAuth] full auth URL =', url);

    res.redirect(url);
});

// Google OAuth callback - exchange code for tokens, fetch profile, create/find user and set session
const crypto = require('crypto');

// Use global fetch when available (Node 18+). Fall back to node-fetch only if necessary.
let _fetch;
if (typeof fetch === 'function') {
    _fetch = fetch.bind(globalThis);
} else {
    try {
        // require lazily so environments without node-fetch installed but with global fetch work fine
        _fetch = require('node-fetch');
    } catch (err) {
        console.error('node-fetch is not installed and global fetch is not available. Install node-fetch or run on Node 18+.');
        throw err;
    }
}

router.get('/google/callback', async (req, res) => {
    const code = req.query.code;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const base = process.env.BASE_URL || (`http://localhost:${process.env.PORT || 3000}`);

    if (!code || !clientId || !clientSecret) {
        // Missing required config or code - show register with message
        console.error('Google OAuth callback missing code or client credentials', { codePresent: !!code, clientIdPresent: !!clientId, clientSecretPresent: !!clientSecret });
        return res.render('register', { error: 'Google sign-in is not configured correctly. Please check server settings.' });
    }

    try {
        const redirectUri = `${base}/auth/google/callback`;

        // Exchange authorization code for tokens
    const tokenRes = await _fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });

        if (!tokenRes.ok) {
            const body = await tokenRes.text();
            console.error('Token exchange failed', { status: tokenRes.status, body });
            return res.render('register', { error: 'Failed to exchange authorization code with Google. Check server logs.' });
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            console.error('No access token in token response', tokenData);
            return res.render('register', { error: 'No access token received from Google.' });
        }

        // Fetch user info from Google
    const profileRes = await _fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!profileRes.ok) {
            const body = await profileRes.text();
            console.error('Failed to fetch Google profile', { status: profileRes.status, body });
            return res.render('register', { error: 'Failed to fetch Google profile. Check server logs.' });
        }

        const profile = await profileRes.json();
        const email = profile.email;
        const name = profile.name || profile.email.split('@')[0];

        if (!email) {
            console.error('Google profile missing email', profile);
            return res.render('register', { error: 'Google account did not return an email address.' });
        }

        // Find or create user
        let user = await User.findOne({ email });
        if (!user) {
            // Ensure unique username: try name, then append random suffix until available
            let baseUsername = name.replace(/\s+/g, '').toLowerCase();
            if (!baseUsername) baseUsername = email.split('@')[0];
            let usernameCandidate = baseUsername;
            let counter = 0;
            while (await User.findOne({ username: usernameCandidate })) {
                counter += 1;
                usernameCandidate = `${baseUsername}${counter}`;
            }

            // Create user with a random password (user can reset later)
            const randomPassword = crypto.randomBytes(16).toString('hex');
            user = new User({
                username: usernameCandidate,
                email,
                password: randomPassword
            });
            await user.save();
        }

        // Set session and redirect to home
        req.session.user = {
            id: user._id,
            username: user.username
        };
        return res.redirect('/');
    } catch (err) {
        console.error('Error during Google OAuth callback', err);
        return res.render('register', { error: 'An unexpected error occurred during Google sign-in. Check server logs.' });
    }
});

module.exports = router;