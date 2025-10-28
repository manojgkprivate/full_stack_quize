const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    // Multiple questions: each question has two images and a single answer
    questions: [
        {
            image1: {
                data: Buffer,
                contentType: String
            },
            image2: {
                data: Buffer,
                contentType: String
            },
            answer: {
                type: String
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    // Game scores history
    highScore: {
        type: Number,
        default: 0
    },
    scores: [
        {
            score: Number,
            correct: Number,
            total: Number,
            timeSpentSeconds: Number,
            createdAt: { type: Date, default: Date.now }
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
UserSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);