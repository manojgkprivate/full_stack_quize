// Seed script to generate test data
const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function seedData() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check if test users already exist
        const existing = await User.find({ username: /^testuser\d+$/ });
        if (existing.length > 0) {
            console.log('Test data already exists. Skipping...');
            await mongoose.disconnect();
            return;
        }

        const testAnswers = ['cat', 'dog', 'tree', 'house', 'car', 'flower', 'mountain', 'river', 'book', 'computer',
                             'phone', 'chair', 'table', 'window', 'door', 'bicycle', 'airplane', 'ship', 'train', 'guitar'];

        // Create 3 test users with 10 questions each
        for (let userNum = 1; userNum <= 3; userNum++) {
            const testUser = new User({
                username: `testuser${userNum}`,
                email: `testuser${userNum}@test.com`,
                password: 'TestPassword123!',
                questions: []
            });

            // Simple 1x1 PNG pixel as test image
            const pngBuffer = Buffer.from([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
                0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
                0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
                0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00,
                0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
            ]);

            // Add 10 questions per user
            for (let qNum = 0; qNum < 10; qNum++) {
                testUser.questions.push({
                    image1: { data: pngBuffer, contentType: 'image/png' },
                    image2: { data: pngBuffer, contentType: 'image/png' },
                    answer: testAnswers[qNum % testAnswers.length],
                    createdAt: new Date()
                });
            }

            await testUser.save();
            console.log(`Created testuser${userNum} with 10 questions`);
        }

        console.log('✓ Test data seeded successfully');
        console.log('Total: 3 users × 10 questions = 30 questions');
        console.log('\nTest user credentials:');
        console.log('- testuser1@test.com / TestPassword123!');
        console.log('- testuser2@test.com / TestPassword123!');
        console.log('- testuser3@test.com / TestPassword123!');

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
}

seedData();
