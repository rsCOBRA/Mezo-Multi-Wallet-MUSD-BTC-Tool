const { ethers } = require("ethers");
const fs = require("fs");
const readline = require("readline");

// ================== CONFIG ==================
const RPC_URL = "https://rpc.test.mezo.org";
const CHAIN_ID = 31611;
const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

const DRY_RUN = false;
const WALLETS_FILE = "wallets.txt";
const SAVED_FILE = "saved_addresses.json";
const MAX_RETRIES = 2;
// ============================================

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

const musd = new ethers.Contract(MUSD, ERC20_ABI, provider);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function loadSaved() {
  if (!fs.existsSync(SAVED_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SAVED_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveAddress(addr, label = "") {
  const list = loadSaved();
  if (list.some(a => a.address.toLowerCase() === addr.toLowerCase())) return;
  list.push({ address: addr, label });
  fs.writeFileSync(SAVED_FILE, JSON.stringify(list, null, 2));
}

async function loadWallets() {
  const content = fs.readFileSync(WALLETS_FILE, "utf8");
  const keys = content.split("\n").map(l => l.trim()).filter(Boolean);
  const wallets = keys.map(k => {
    if (!k.startsWith("0x")) k = "0x" + k;
    return new ethers.Wallet(k, provider);
  });
  console.log(`Loaded ${wallets.length} wallets`);
  return wallets;
}

async function selectWallets(wallets) {
  console.log("\nWallets:");
  wallets.forEach((w, i) => {
    console.log(`${i + 1}. ${w.address}`);
  });
  console.log(`${wallets.length + 1}. all`);

  const choice = await ask("Which wallet? (number or 'all'): ");
  const num = parseInt(choice);

  if (choice.toLowerCase() === "all" || num === wallets.length + 1) {
    return wallets;
  }
  if (!isNaN(num) && num >= 1 && num <= wallets.length) {
    return [wallets[num - 1]];
  }
  console.log("Invalid choice, defaulting to all");
  return wallets;
}

async function getTransferDetails() {
  const typeChoice = await ask("Send what? 1 = MUSD, 2 = BTC: ");
  const isMUSD = typeChoice.trim() === "1";

  const saved = loadSaved();
  let toAddress = "";

  if (saved.length > 0) {
    console.log("\nSaved addresses:");
    saved.forEach((a, i) => {
      console.log(`${i + 1}. ${a.address}${a.label ? " (" + a.label + ")" : ""}`);
    });
    console.log(`${saved.length + 1}. New address`);

    const choice = await ask("Pick a number (or enter address): ");
    const num = parseInt(choice);

    if (!isNaN(num) && num >= 1 && num <= saved.length) {
      toAddress = saved[num - 1].address;
    } else if (!isNaN(num) && num === saved.length + 1) {
      toAddress = await ask("Enter new address: ");
    } else if (choice.startsWith("0x") && choice.length === 42) {
      toAddress = choice;
    } else {
      toAddress = await ask("Enter address: ");
    }
  } else {
    toAddress = await ask("Enter recipient address: ");
  }

  const amountStr = await ask(`How much ${isMUSD ? "MUSD" : "BTC"} to send per wallet? `);
  return { toAddress: toAddress.trim(), amountStr: amountStr.trim(), isMUSD };
}

async function checkOrTransfer(wallet, toAddress, amountWei, isMUSD, attempt = 1) {
  const start = Date.now();
  try {
    console.log(`[${wallet.address.slice(0, 8)}] Processing... (attempt ${attempt})`);

    if (isMUSD) {
      const bal = await musd.balanceOf(wallet.address);
      console.log(`[${wallet.address.slice(0, 8)}] MUSD balance: ${ethers.formatUnits(bal, 18)}`);
      if (bal < amountWei) {
        console.log(`[${wallet.address.slice(0, 8)}] ❌ Insufficient MUSD`);
        return false;
      }
      if (DRY_RUN) {
        console.log(`[${wallet.address.slice(0, 8)}] DRY_RUN – would transfer ${ethers.formatUnits(amountWei, 18)} MUSD`);
        return true;
      }
      const contract = musd.connect(wallet);
      const tx = await contract.transfer(toAddress, amountWei);
      console.log(`[${wallet.address.slice(0, 8)}] ✅ Sent: ${tx.hash}`);
      const receipt = await tx.wait();
      const seconds = ((Date.now() - start) / 1000).toFixed(2);
      if (receipt.status === 1) {
        console.log(`[${wallet.address.slice(0, 8)}] ✅ Success in ${seconds}s`);
        return true;
      } else {
        console.log(`[${wallet.address.slice(0, 8)}] ❌ Reverted (${seconds}s)`);
        return false;
      }
    } else {
      const bal = await provider.getBalance(wallet.address);
      console.log(`[${wallet.address.slice(0, 8)}] BTC balance: ${ethers.formatUnits(bal, 18)}`);
      if (bal < amountWei) {
        console.log(`[${wallet.address.slice(0, 8)}] ❌ Insufficient BTC`);
        return false;
      }
      if (DRY_RUN) {
        console.log(`[${wallet.address.slice(0, 8)}] DRY_RUN – would transfer ${ethers.formatUnits(amountWei, 18)} BTC`);
        return true;
      }
      const tx = await wallet.sendTransaction({ to: toAddress, value: amountWei });
      console.log(`[${wallet.address.slice(0, 8)}] ✅ Sent: ${tx.hash}`);
      const receipt = await tx.wait();
      const seconds = ((Date.now() - start) / 1000).toFixed(2);
      if (receipt.status === 1) {
        console.log(`[${wallet.address.slice(0, 8)}] ✅ Success in ${seconds}s`);
        return true;
      } else {
        console.log(`[${wallet.address.slice(0, 8)}] ❌ Reverted (${seconds}s)`);
        return false;
      }
    }
  } catch (err) {
    const seconds = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[${wallet.address.slice(0, 8)}] ❌ Error after ${seconds}s: ${err.message}`);
    if (attempt < MAX_RETRIES) {
      console.log(`[${wallet.address.slice(0, 8)}] 🔄 Retrying in 1 second...`);
      await new Promise(r => setTimeout(r, 1000));
      return checkOrTransfer(wallet, toAddress, amountWei, isMUSD, attempt + 1);
    }
    return false;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("=".repeat(50));
  console.log("Mezo Multi-Wallet MUSD/BTC Tool");
  console.log(`DRY_RUN = ${DRY_RUN}`);
  console.log("=".repeat(50));

  const wallets = await loadWallets();
  if (wallets.length === 0) {
    rl.close();
    return;
  }

  const selected = await selectWallets(wallets);
  if (selected.length === 0) {
    rl.close();
    return;
  }

  const { toAddress, amountStr, isMUSD } = await getTransferDetails();
  if (!ethers.isAddress(toAddress)) {
    console.log("Invalid address");
    rl.close();
    return;
  }

  const amountWei = ethers.parseUnits(amountStr || "0", 18);
  if (amountWei === 0n) {
    console.log("Amount must be > 0");
    rl.close();
    return;
  }

  console.log(`\nSending ${amountStr} ${isMUSD ? "MUSD" : "BTC"} to ${toAddress} from ${selected.length} wallet(s)...\n`);

  const results = [];
  for (let i = 0; i < selected.length; i++) {
    results.push(checkOrTransfer(selected[i], toAddress, amountWei, isMUSD));
    if (i < selected.length - 1) await sleep(300);
  }

  const final = await Promise.all(results);
  const success = final.filter(Boolean).length;
  console.log(`\nDone. ${success}/${selected.length} successful`);

  const saved = loadSaved();
  const alreadySaved = saved.some(a => a.address.toLowerCase() === toAddress.toLowerCase());
  if (!alreadySaved) {
    const save = await ask("\nSave this address for next time? (y/n): ");
    if (save.toLowerCase().startsWith("y")) {
      const label = await ask("Optional label (or press enter): ");
      saveAddress(toAddress, label.trim());
      console.log("Saved.");
    }
  }

  rl.close();
}

main().catch(err => {
  console.error(err);
  rl.close();
});
