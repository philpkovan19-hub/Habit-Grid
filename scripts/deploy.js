const { ethers, network } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Network:", network.name);
  console.log("Deployer:", signer.address);
  console.log("Balance:", ethers.formatEther(balance), "BOT");

  const F = await ethers.getContractFactory("HabitGrid");
  const hg = await F.deploy();
  await hg.waitForDeployment();
  const addr = await hg.getAddress();

  console.log("HabitGrid deployed at:", addr);
  console.log("Create fee:", ethers.formatEther(await hg.createFee()), "BOT");
  console.log("");
  console.log("Update CONTRACT_ADDRESS in frontend/index.html");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
