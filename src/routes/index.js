const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('../models/User');

// Multer storage configuration
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/auth/login');
};

// Home page
// Home page with top 5 users by high score
router.get('/', async (req, res) => {
    try {
        // Get top 5 users by highScore (descending)
        const topUsers = await User.find({ highScore: { $gt: 0 } })
            .sort({ highScore: -1 })
            .limit(5)
            .select('username highScore');
        res.render('home', { user: req.session.user, topUsers });
    } catch (err) {
        console.error(err);
        res.render('home', { user: req.session.user, topUsers: [] });
    }
});

// Dashboard route removed (home and dashboard are the same)

// Game page - Protected route
router.get('/game', isAuthenticated, async (req, res) => {
    try {
        // Fetch users who have uploaded images, excluding the current logged-in user
        const excludeId = req.session && req.session.user && req.session.user.id ? req.session.user.id : null;
        const users = await User.find({
            'image1.data': { $exists: true },
            'image2.data': { $exists: true },
            'answer': { $exists: true },
            ...(excludeId ? { _id: { $ne: excludeId } } : {})
        });

        // Prepare the game data
        const gameData = users.map(user => ({
            id: user._id,
            username: user.username,
            hasImages: true
        }));

        res.render('game', { 
            user: req.session.user,
            gameData: gameData
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

    // API route to get game data
    router.get('/api/game-data', isAuthenticated, async (req, res) => {
        try {
                const excludeId = req.session && req.session.user && req.session.user.id ? req.session.user.id : null;

                // Find users with questions and return flattened question list (exclude current user's questions)
                const users = await User.find({
                    'questions.0': { $exists: true },
                    ...(excludeId ? { _id: { $ne: excludeId } } : {})
                }).select('_id username questions');

                const questions = [];
                users.forEach(u => {
                    if (u.questions && u.questions.length) {
                        u.questions.forEach(q => {
                            if (q && q.answer) {
                                questions.push({
                                    userId: u._id.toString(),
                                    username: u.username,
                                    questionId: q._id.toString(),
                                    answer: q.answer
                                });
                            }
                        });
                    }
                });

                res.json({ questions });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server Error' });
        }
    });

// API route to get user's images
// Keep legacy endpoint for single-image fields (if present)
router.get('/api/images/:userId/:imageNum', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Try legacy fields first
        const legacyImage = req.params.imageNum === '1' ? user.image1 : user.image2;
        if (legacyImage && legacyImage.data) {
            res.set('Content-Type', legacyImage.contentType);
            return res.send(legacyImage.data);
        }

        return res.status(404).send('Image not found');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// New API route to get question images by question id - with caching and compression
router.get('/api/questions/:userId/:questionId/:imageNum', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).send('User not found');

        const q = user.questions.id(req.params.questionId);
        if (!q) return res.status(404).send('Question not found');

        const image = req.params.imageNum === '1' ? q.image1 : q.image2;
        if (!image || !image.data) return res.status(404).send('Image not found');

        // Set caching headers for 7 days (604800 seconds)
        res.set('Cache-Control', 'public, max-age=604800');
        res.set('Content-Type', image.contentType);
        res.set('Content-Length', image.data.length);
        
        // Add ETag for browser caching
        const etag = `"${Buffer.from(image.data).toString('base64').substring(0, 10)}"`;
        res.set('ETag', etag);
        
        res.send(image.data);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Submit game result
router.post('/api/game/submit', isAuthenticated, async (req, res) => {
    try {
        const { score, correct, total, timeSpentSeconds } = req.body;
        const user = await User.findById(req.session.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.scores = user.scores || [];
        user.scores.push({ 
            score: Number(score) || 0, 
            correct: Number(correct) || 0, 
            total: Number(total) || 0,
            timeSpentSeconds: Number(timeSpentSeconds) || 0,
            createdAt: new Date() 
        });

        // update highScore
        user.highScore = Math.max(user.highScore || 0, Number(score) || 0);

        await user.save();
        res.json({ ok: true, highScore: user.highScore });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Account page - Protected route
router.get('/account', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.redirect('/auth/login');
        }
        // If old legacy image fields exist, migrate them to questions (one-time)
        if ((user.image1 && user.image1.data) || (user.image2 && user.image2.data)) {
            const hasQuestions = user.questions && user.questions.length;
            if (!hasQuestions) {
                const q = {
                    image1: user.image1 && user.image1.data ? user.image1 : undefined,
                    image2: user.image2 && user.image2.data ? user.image2 : undefined,
                    answer: user.answer || undefined
                };
                user.questions = [q];
                // Clear legacy fields (optional)
                user.image1 = undefined;
                user.image2 = undefined;
                user.answer = undefined;
                await user.save();
            }
        }
        res.render('account', { user: user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Questions page (separate page for adding and listing user's questions)
router.get('/questions', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        if (!user) return res.redirect('/auth/login');

        // Ensure legacy fields are migrated (same logic as /account)
        if ((user.image1 && user.image1.data) || (user.image2 && user.image2.data)) {
            const hasQuestions = user.questions && user.questions.length;
            if (!hasQuestions) {
                const q = {
                    image1: user.image1 && user.image1.data ? user.image1 : undefined,
                    image2: user.image2 && user.image2.data ? user.image2 : undefined,
                    answer: user.answer || undefined
                };
                user.questions = [q];
                user.image1 = undefined;
                user.image2 = undefined;
                user.answer = undefined;
                await user.save();
            }
        }

        res.render('questions', { user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Handle image uploads
router.post('/account/upload-images', isAuthenticated, upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 }
]), async (req, res) => {
    try {
        // Legacy upload endpoint: move to questions array
        const user = await User.findById(req.session.user.id);
        const newQuestion = {};
        if (req.files['image1']) {
            newQuestion.image1 = {
                data: req.files['image1'][0].buffer,
                contentType: req.files['image1'][0].mimetype
            };
        }
        if (req.files['image2']) {
            newQuestion.image2 = {
                data: req.files['image2'][0].buffer,
                contentType: req.files['image2'][0].mimetype
            };
        }
        newQuestion.answer = req.body.answer;

        user.questions = user.questions || [];
        user.questions.push(newQuestion);
        await user.save();
        res.redirect('/account');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error uploading images');
    }
});

// New endpoint: create a question (two images + answer)
router.post('/account/questions', isAuthenticated, upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 }
]), async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        const q = {};
        if (req.files['image1']) q.image1 = { data: req.files['image1'][0].buffer, contentType: req.files['image1'][0].mimetype };
        if (req.files['image2']) q.image2 = { data: req.files['image2'][0].buffer, contentType: req.files['image2'][0].mimetype };
        q.answer = req.body.answer;
        q.createdAt = new Date();

        user.questions = user.questions || [];
        user.questions.push(q);
        await user.save();
        res.redirect('/account');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating question');
    }
});

// Update a question
router.post('/account/questions/:qid', isAuthenticated, upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 }
]), async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        if (!user) return res.status(404).send('User not found');
        const q = user.questions.id(req.params.qid);
        if (!q) return res.status(404).send('Question not found');
        // Only replace images if new files are uploaded
        if (req.files && req.files['image1'] && req.files['image1'][0]) {
            q.image1 = { data: req.files['image1'][0].buffer, contentType: req.files['image1'][0].mimetype };
        }
        if (req.files && req.files['image2'] && req.files['image2'][0]) {
            q.image2 = { data: req.files['image2'][0].buffer, contentType: req.files['image2'][0].mimetype };
        }
        if (typeof req.body.answer !== 'undefined') q.answer = req.body.answer;
        await user.save();
        res.redirect('/account');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating question');
    }
});

// Delete a question
router.post('/account/questions/:qid/delete', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        user.questions = user.questions.filter(q => q._id.toString() !== req.params.qid);
        await user.save();
        res.redirect('/account');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting question');
    }
});

// Get edit question page
router.get('/account/questions/:qid/edit', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        if (!user) return res.redirect('/auth/login');

        const question = user.questions.id(req.params.qid);
        if (!question) return res.status(404).send('Question not found');

        res.render('edit_question', { user, question });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;