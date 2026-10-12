const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const FEE = ethers.parseEther("0.0005");
const DAY = 86400;

describe("HabitGrid", function () {
  let hg, owner, alice, bob;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const F = await ethers.getContractFactory("HabitGrid");
    hg = await F.deploy();
    await hg.waitForDeployment();
  });

  async function currentDay() {
    return Number(await hg.getCurrentDay());
  }

  it("creates a habit with correct fee and validates name/description", async () => {
    await expect(hg.connect(alice).createHabit("Read", "20 min daily", { value: FEE }))
      .to.emit(hg, "HabitCreated");
    expect(await hg.habitCount()).to.equal(1n);

    await expect(hg.connect(alice).createHabit("A", "", { value: 0 })).to.be.revertedWith("insufficient fee");
    await expect(hg.connect(alice).createHabit("", "x", { value: FEE })).to.be.revertedWith("name length");
    const long = "x".repeat(65);
    await expect(hg.connect(alice).createHabit(long, "x", { value: FEE })).to.be.revertedWith("name length");
    const longDesc = "y".repeat(201);
    await expect(hg.connect(alice).createHabit("N", longDesc, { value: FEE })).to.be.revertedWith("desc length");
  });

  it("checkIn only owner and first check-in sets streak=1", async () => {
    await hg.connect(alice).createHabit("Run", "5k", { value: FEE });
    await expect(hg.connect(bob).checkIn(1)).to.be.revertedWith("not owner");
    await hg.connect(alice).checkIn(1);
    const h = await hg.getHabit(1);
    expect(h[4]).to.equal(1n); // totalCheckIns
    expect(h[5]).to.equal(1n); // currentStreak
    expect(h[6]).to.equal(1n); // longestStreak
  });

  it("consecutive-day check-ins extend streak, gap resets to 1", async () => {
    await hg.connect(alice).createHabit("Meditate", "", { value: FEE });
    await hg.connect(alice).checkIn(1);
    await time.increase(DAY);
    await hg.connect(alice).checkIn(1);
    await time.increase(DAY);
    await hg.connect(alice).checkIn(1);
    let h = await hg.getHabit(1);
    expect(h[5]).to.equal(3n);
    expect(h[6]).to.equal(3n);

    // skip 2 days
    await time.increase(DAY * 3);
    await hg.connect(alice).checkIn(1);
    h = await hg.getHabit(1);
    expect(h[5]).to.equal(1n);
    expect(h[6]).to.equal(3n); // longest preserved
  });

  it("rejects same-day double check-in", async () => {
    await hg.connect(alice).createHabit("Water", "", { value: FEE });
    await hg.connect(alice).checkIn(1);
    await expect(hg.connect(alice).checkIn(1)).to.be.revertedWith("already checked in");
  });

  it("longestStreak tracks max ever after later shorter streaks", async () => {
    await hg.connect(alice).createHabit("X", "", { value: FEE });
    for (let i = 0; i < 5; i++) {
      await hg.connect(alice).checkIn(1);
      await time.increase(DAY);
    }
    let h = await hg.getHabit(1);
    expect(h[6]).to.equal(5n);
    await time.increase(DAY * 4); // gap
    await hg.connect(alice).checkIn(1);
    await time.increase(DAY);
    await hg.connect(alice).checkIn(1);
    h = await hg.getHabit(1);
    expect(h[5]).to.equal(2n);
    expect(h[6]).to.equal(5n);
  });

  it("getCheckIns returns correct range and enforces max span", async () => {
    await hg.connect(alice).createHabit("Y", "", { value: FEE });
    const d0 = await currentDay();
    await hg.connect(alice).checkIn(1);
    await time.increase(DAY * 2);
    await hg.connect(alice).checkIn(1);
    const arr = await hg.getCheckIns(1, d0, d0 + 3);
    expect(arr[0]).to.equal(true);
    expect(arr[1]).to.equal(false);
    expect(arr[2]).to.equal(true);
    expect(arr[3]).to.equal(false);

    await expect(hg.getCheckIns(1, 0, 371)).to.be.revertedWith("range too large");
    await expect(hg.getCheckIns(1, 10, 5)).to.be.revertedWith("bad range");
  });

  it("didCheckIn matches getCheckIns", async () => {
    await hg.connect(alice).createHabit("Z", "", { value: FEE });
    const d = await currentDay();
    await hg.connect(alice).checkIn(1);
    expect(await hg.didCheckIn(1, d)).to.equal(true);
    expect(await hg.didCheckIn(1, d + 1)).to.equal(false);
  });

  it("getHabitsByOwner and getRecent pagination", async () => {
    await hg.connect(alice).createHabit("A", "", { value: FEE });
    await hg.connect(bob).createHabit("B", "", { value: FEE });
    await hg.connect(alice).createHabit("C", "", { value: FEE });
    const alist = await hg.getHabitsByOwner(alice.address);
    expect(alist.map((n) => Number(n))).to.deep.equal([1, 3]);
    const recent = await hg.getRecent(0, 10);
    expect(recent.map((n) => Number(n))).to.deep.equal([3, 2, 1]);
    const page = await hg.getRecent(1, 1);
    expect(page.map((n) => Number(n))).to.deep.equal([2]);
    const empty = await hg.getRecent(99, 10);
    expect(empty.length).to.equal(0);
  });

  it("admin: setCreateFee bounds, pause blocks, withdrawFees works", async () => {
    await expect(hg.connect(alice).setCreateFee(1n)).to.be.reverted;
    await expect(hg.setCreateFee(ethers.parseEther("0.2"))).to.be.revertedWith("fee too high");
    await hg.setCreateFee(ethers.parseEther("0.01"));
    expect(await hg.createFee()).to.equal(ethers.parseEther("0.01"));

    await hg.pause();
    await expect(hg.connect(alice).createHabit("N", "", { value: ethers.parseEther("0.01") })).to.be.reverted;
    await hg.unpause();
    await hg.connect(alice).createHabit("N", "", { value: ethers.parseEther("0.01") });

    const before = await ethers.provider.getBalance(bob.address);
    await hg.withdrawFees(bob.address);
    const after = await ethers.provider.getBalance(bob.address);
    expect(after - before).to.equal(ethers.parseEther("0.01"));
    await expect(hg.withdrawFees(bob.address)).to.be.revertedWith("no balance");
  });

  it("getHabit reverts on unknown id", async () => {
    await expect(hg.getHabit(999)).to.be.revertedWith("no habit");
  });

  it("checkIn reverts on unknown habit", async () => {
    await expect(hg.connect(alice).checkIn(1)).to.be.revertedWith("no habit");
  });

  it("getCurrentDay progresses with time", async () => {
    const d0 = await currentDay();
    await time.increase(DAY);
    const d1 = await currentDay();
    expect(d1 - d0).to.equal(1);
  });

  it("createHabit accepts overpayment", async () => {
    await hg.connect(alice).createHabit("Over", "", { value: ethers.parseEther("0.01") });
    expect(await ethers.provider.getBalance(await hg.getAddress())).to.equal(ethers.parseEther("0.01"));
  });
});
