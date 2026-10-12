// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title HabitGrid — GitHub-contribution-grid-style habit tracker
/// @notice Users declare habits and check in once per day; grid stored sparsely.
contract HabitGrid is Ownable, ReentrancyGuard, Pausable {
    struct Habit {
        address owner;
        string name;
        string description;
        uint256 createdDay;
        uint256 totalCheckIns;
        uint256 currentStreak;
        uint256 longestStreak;
        uint256 lastCheckInDay;
    }

    uint256 public constant SECONDS_PER_DAY = 86400;
    uint256 public constant MAX_CREATE_FEE = 0.1 ether;
    uint256 public constant MAX_RANGE = 371;

    uint256 public createFee = 0.0005 ether;
    uint256 public habitCount;

    mapping(uint256 => Habit) private habits;
    mapping(uint256 => mapping(uint256 => bool)) private checkIns; // habitId => dayIdx => checked
    mapping(address => uint256[]) private habitsByOwner;

    event HabitCreated(uint256 indexed habitId, address indexed owner, string name, uint256 createdDay);
    event CheckedIn(uint256 indexed habitId, uint256 indexed day, uint256 streak);
    event CreateFeeUpdated(uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function getCurrentDay() public view returns (uint256) {
        return block.timestamp / SECONDS_PER_DAY;
    }

    function createHabit(string calldata name, string calldata description)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 habitId)
    {
        require(msg.value >= createFee, "insufficient fee");
        bytes memory n = bytes(name);
        require(n.length >= 1 && n.length <= 64, "name length");
        require(bytes(description).length <= 200, "desc length");

        habitId = ++habitCount;
        uint256 today = getCurrentDay();
        habits[habitId] = Habit({
            owner: msg.sender,
            name: name,
            description: description,
            createdDay: today,
            totalCheckIns: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastCheckInDay: 0
        });
        habitsByOwner[msg.sender].push(habitId);

        emit HabitCreated(habitId, msg.sender, name, today);
    }

    function checkIn(uint256 habitId) external whenNotPaused nonReentrant {
        Habit storage h = habits[habitId];
        require(h.owner != address(0), "no habit");
        require(h.owner == msg.sender, "not owner");

        uint256 today = getCurrentDay();
        require(!checkIns[habitId][today], "already checked in");

        uint256 last = h.lastCheckInDay;
        uint256 newStreak;
        if (h.totalCheckIns == 0) {
            newStreak = 1;
        } else if (last + 1 == today) {
            newStreak = h.currentStreak + 1;
        } else {
            // gap
            newStreak = 1;
        }

        checkIns[habitId][today] = true;
        h.lastCheckInDay = today;
        h.totalCheckIns += 1;
        h.currentStreak = newStreak;
        if (newStreak > h.longestStreak) {
            h.longestStreak = newStreak;
        }

        emit CheckedIn(habitId, today, newStreak);
    }

    function getHabit(uint256 habitId)
        external
        view
        returns (
            address owner_,
            string memory name,
            string memory description,
            uint256 createdDay,
            uint256 totalCheckIns,
            uint256 currentStreak,
            uint256 longestStreak,
            uint256 lastCheckInDay
        )
    {
        Habit storage h = habits[habitId];
        require(h.owner != address(0), "no habit");
        return (
            h.owner,
            h.name,
            h.description,
            h.createdDay,
            h.totalCheckIns,
            h.currentStreak,
            h.longestStreak,
            h.lastCheckInDay
        );
    }

    function didCheckIn(uint256 habitId, uint256 dayIdx) external view returns (bool) {
        return checkIns[habitId][dayIdx];
    }

    function getCheckIns(uint256 habitId, uint256 startDay, uint256 endDay)
        external
        view
        returns (bool[] memory result)
    {
        require(endDay >= startDay, "bad range");
        uint256 span = endDay - startDay + 1;
        require(span <= MAX_RANGE, "range too large");
        result = new bool[](span);
        for (uint256 i = 0; i < span; i++) {
            result[i] = checkIns[habitId][startDay + i];
        }
    }

    function getHabitsByOwner(address who) external view returns (uint256[] memory) {
        return habitsByOwner[who];
    }

    /// @notice Newest-first pagination over all habits.
    function getRecent(uint256 startOffset, uint256 limit) external view returns (uint256[] memory ids) {
        if (startOffset >= habitCount || limit == 0) {
            return new uint256[](0);
        }
        uint256 remaining = habitCount - startOffset;
        uint256 n = remaining < limit ? remaining : limit;
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = habitCount - startOffset - i;
        }
    }

    // Admin
    function setCreateFee(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_CREATE_FEE, "fee too high");
        createFee = newFee;
        emit CreateFeeUpdated(newFee);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function withdrawFees(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "zero to");
        uint256 bal = address(this).balance;
        require(bal > 0, "no balance");
        (bool ok, ) = to.call{value: bal}("");
        require(ok, "withdraw failed");
        emit FeesWithdrawn(to, bal);
    }
}
