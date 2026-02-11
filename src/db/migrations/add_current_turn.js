const pool = require('../pool');

async function addCurrentTurnColumn() {
  try {
    console.log('🔧 Adding current_turn_player_id column to games table...');
    
    // Add column if it doesn't exist
    await pool.query(`
      ALTER TABLE games 
      ADD COLUMN IF NOT EXISTS current_turn_player_id INT REFERENCES users(id) ON DELETE SET NULL;
    `);
    
    console.log('✅ Column added successfully');
    
    // Initialize current_turn_player_id for existing in_progress games
    // Player 1 always starts first
    await pool.query(`
      UPDATE games 
      SET current_turn_player_id = player1_id 
      WHERE status = 'in_progress' 
      AND current_turn_player_id IS NULL;
    `);
    
    console.log('✅ Initialized current_turn_player_id for existing games');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addCurrentTurnColumn();
