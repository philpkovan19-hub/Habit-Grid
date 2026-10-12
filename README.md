# HabitGrid

GitHub-contribution-grid-style habit tracker on BOT Chain. Declare habits, check in once per day, watch your streak grow across a year-long contribution grid.

## Networks
- Testnet — chainId 968 (0x3C8), RPC https://rpc.bohr.life
- Mainnet — chainId 677 (0x2A5), RPC https://rpc.botchain.ai

## Quick start
```
npm install
cp .env.example .env      # paste PRIVATE_KEY
npx hardhat test
npm run deploy:testnet
```
Then paste the deployed address into `CONTRACT_ADDRESS` in `frontend/index.html`.

## Contract
- `createHabit(name, description)` — 0.0005 BOT default fee, name 1-64, desc 0-200 chars
- `checkIn(habitId)` — one check-in per day per habit (owner only)
- Grid stored sparsely: only checked days are written (`mapping(habitId => dayIdx => bool)`)
- Streak: consecutive-day increments, gap resets to 1, same-day dup rejected
- Batch reads: `getCheckIns(habitId, startDay, endDay)` up to 371 days per call

## Frontend
Single HTML file at `frontend/index.html`. Data-brutalist spreadsheet look. Deploy to Vercel or any static host.

## Files
- `contracts/HabitGrid.sol`
- `test/HabitGrid.test.js`
- `scripts/deploy.js`
- `frontend/index.html`
