const { dbHelpers } = require('./database');

async function initializeQuizData() {
  try {
    console.log('Initializing quiz data...');

    // Create a quiz
    const quizResult = await dbHelpers.run(
      'INSERT INTO quizzes (name, is_active) VALUES (?, 1)',
      ['General Knowledge Quiz']
    );
    const quizId = quizResult.id;
    console.log(`Created quiz with ID: ${quizId}`);

    // Create Round 1
    const round1Result = await dbHelpers.run(
      'INSERT INTO rounds (quiz_id, round_number, is_active) VALUES (?, ?, 0)',
      [quizId, 1]
    );
    const round1Id = round1Result.id;

    // Add questions to Round 1
    const round1Questions = [
      {
        text: 'What is the capital of France?',
        options: ['London', 'Berlin', 'Paris', 'Madrid'],
        correct: 'C'
      },
      {
        text: 'Which planet is known as the Red Planet?',
        options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
        correct: 'B'
      },
      {
        text: 'Who painted the Mona Lisa?',
        options: ['Vincent van Gogh', 'Pablo Picasso', 'Leonardo da Vinci', 'Michelangelo'],
        correct: 'C'
      },
      {
        text: 'What is the largest ocean on Earth?',
        options: ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean', 'Pacific Ocean'],
        correct: 'D'
      },
      {
        text: 'In which year did World War II end?',
        options: ['1943', '1944', '1945', '1946'],
        correct: 'C'
      }
    ];

    for (const q of round1Questions) {
      await dbHelpers.run(
        `INSERT INTO questions (round_id, question_text, option_a, option_b, option_c, option_d, correct_answer)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [round1Id, q.text, q.options[0], q.options[1], q.options[2], q.options[3], q.correct]
      );
    }
    console.log(`Added ${round1Questions.length} questions to Round 1`);

    // Create Round 2
    const round2Result = await dbHelpers.run(
      'INSERT INTO rounds (quiz_id, round_number, is_active) VALUES (?, ?, 0)',
      [quizId, 2]
    );
    const round2Id = round2Result.id;

    // Add questions to Round 2
    const round2Questions = [
      {
        text: 'What is the smallest prime number?',
        options: ['0', '1', '2', '3'],
        correct: 'C'
      },
      {
        text: 'Which element has the chemical symbol "O"?',
        options: ['Gold', 'Silver', 'Oxygen', 'Osmium'],
        correct: 'C'
      },
      {
        text: 'How many continents are there?',
        options: ['5', '6', '7', '8'],
        correct: 'C'
      },
      {
        text: 'Who wrote "Romeo and Juliet"?',
        options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'],
        correct: 'B'
      },
      {
        text: 'What is the speed of light?',
        options: ['300,000 km/s', '150,000 km/s', '450,000 km/s', '600,000 km/s'],
        correct: 'A'
      }
    ];

    for (const q of round2Questions) {
      await dbHelpers.run(
        `INSERT INTO questions (round_id, question_text, option_a, option_b, option_c, option_d, correct_answer)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [round2Id, q.text, q.options[0], q.options[1], q.options[2], q.options[3], q.correct]
      );
    }
    console.log(`Added ${round2Questions.length} questions to Round 2`);

    // Create Round 3
    const round3Result = await dbHelpers.run(
      'INSERT INTO rounds (quiz_id, round_number, is_active) VALUES (?, ?, 0)',
      [quizId, 3]
    );
    const round3Id = round3Result.id;

    // Add questions to Round 3
    const round3Questions = [
      {
        text: 'What is the tallest mountain in the world?',
        options: ['K2', 'Mount Everest', 'Kangchenjunga', 'Lhotse'],
        correct: 'B'
      },
      {
        text: 'Which country is famous for the pyramids?',
        options: ['Mexico', 'Greece', 'Egypt', 'Peru'],
        correct: 'C'
      },
      {
        text: 'What is the largest mammal?',
        options: ['African Elephant', 'Blue Whale', 'Giraffe', 'Polar Bear'],
        correct: 'B'
      },
      {
        text: 'How many sides does a hexagon have?',
        options: ['5', '6', '7', '8'],
        correct: 'B'
      },
      {
        text: 'What is the currency of Japan?',
        options: ['Yuan', 'Won', 'Yen', 'Ringgit'],
        correct: 'C'
      }
    ];

    for (const q of round3Questions) {
      await dbHelpers.run(
        `INSERT INTO questions (round_id, question_text, option_a, option_b, option_c, option_d, correct_answer)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [round3Id, q.text, q.options[0], q.options[1], q.options[2], q.options[3], q.correct]
      );
    }
    console.log(`Added ${round3Questions.length} questions to Round 3`);

    console.log('\n✅ Quiz data initialized successfully!');
    console.log(`Quiz ID: ${quizId}`);
    console.log(`Total rounds: 3`);
    console.log(`Total questions: ${round1Questions.length + round2Questions.length + round3Questions.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error initializing quiz data:', error);
    process.exit(1);
  }
}

// Run initialization
initializeQuizData();