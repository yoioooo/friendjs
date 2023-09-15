import 'dotenv/config';
import moment from 'moment';
import * as ethers from 'ethers';
import { readFileSync } from 'fs';
import { FriendAbi } from './abis/index.js';
import { friendFetchUserInfo } from './utils.js';

const ws_url = process.env.WS_URL;
const pk = process.env.PK;

const provider = new ethers.WebSocketProvider(ws_url);
const account = new ethers.Wallet(pk, provider);
const contractAddress = '0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4';
const friendContract = new ethers.Contract(contractAddress, FriendAbi, account);

let totalScuccess = 0;
let totalError = 0;
let gasLevel = 1;

let errorCount = 0;
let successCount = 0;
let watchStart = 0;

const getGasLimit = () => {
  const gasLimit = ['1.8999', '2.5999', '2.8999'];
  gasLevel = gasLevel > 2 ? 2 : gasLevel < 0 ? 0 : gasLevel;
  return gasLimit[gasLevel] || gasLimit[1];
};

const timestamp = () => moment().format('YYYY-MM-DD HH:mm:ss');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const watch = async share => {
  try {
    const sellPrice = await friendContract.getSellPrice(share, 1);

    const now = new Date().getTime();
    if (now >= watchStart + 1000 * 60 * 5) {
      console.log(`【${timestamp()}】【Watch Fail】超时, 直接卖出, 价格 - ${sellPrice}`);
      return Promise.resolve();
    }

    const config = JSON.parse(readFileSync('config.json').toString());
    const minSellPrice = ethers.parseEther(config.sharePrice);
    if (sellPrice < minSellPrice) {
      await wait(500);
      return watch(share);
    } else {
      console.log(`【${timestamp()}】【Watch】价格 ${ethers.formatEther(sellPrice)}eth, 开始卖出...`);
      return Promise.resolve();
    }
  } catch (error) {
    console.log(`【${timestamp()}】` + '【Watch Fail】', error);
    return Promise.reject(error);
  }
};

const sellShares = async share => {
  try {
    const request = await friendContract.sellShares.populateTransaction(share, 1);
    Object.assign(request, {
      maxFeePerGas: ethers.parseUnits('1.5', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.1', 'gwei')
    });
    console.log(`【${timestamp()}】` + '【Sell Shares】', request);
    const response = await account.sendTransaction(request);
    await response.wait();
    console.log(`【${timestamp()}】` + '【Sell Shares Success】:', response);
    return Promise.resolve();
  } catch (error) {
    console.log('【Sell Self Fail】:', error);
    return Promise.reject(error);
  }
};

const buyShare = async tx => {
  try {
    const request = {
      to: tx.to,
      value: ethers.parseEther('0.00006875'),
      gasLimit: ethers.toBigInt(600000),
      maxFeePerGas: ethers.parseUnits(getGasLimit(), 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits(getGasLimit(), 'gwei'),
      data: tx.input
    };
    console.log(`【${timestamp()}】` + '抢先交易', request);
    const response = await account.sendTransaction(request);
    await response.wait();
    console.log(`【${timestamp()}】` + '抢先交易成功');
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
};

const watchBlock = async () => {
  const { transactions, ...block } = await provider.send('eth_getBlockByNumber', ['pending', true]);
  console.log(`【${timestamp()}】`, ethers.getNumber(block.number), block.hash);
  const txs = transactions.filter(tx => {
    return (
      tx.to === '0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4' &&
      tx.from !== account.address &&
      tx.input.includes('0x6945b123') &&
      BigInt(tx.value) == ethers.parseEther('0') &&
      !!tx.maxPriorityFeePerGas &&
      !!tx.maxFeePerGas
    );
  });
  return Promise.resolve(txs[0]);
};

const main = async () => {
  const tx = await watchBlock();
  if (!!tx) {
    console.log(`【${timestamp()}】这个人在买自己 -`, tx);

    const banalnceBefore = await provider.getBalance(account.address);
    console.log(`【${timestamp()}】` + '【交易前】余额 - ', ethers.formatEther(banalnceBefore));

    try {
      // 买入
      await buyShare(tx);
      // 等待1s，查询账号信息是否有效
      await wait(1000);
      const user = await friendFetchUserInfo(tx.from);
      if (user.valid) {
        watchStart = new Date().getTime();
        // 监听价格
        await watch(tx.from);
      } else {
        console.log(`【${timestamp()}】` + '无效用户, 等待5s后卖出');
        await wait(1000 * 5);
      }
      // 卖出
      await sellShares(tx.from);

      totalScuccess++;
      successCount++;
      errorCount = 0;
      console.log(`【${timestamp()}】抢先交易成功`);
    } catch (error) {
      totalError++;
      errorCount++;
      successCount = 0;
      console.log(`【${timestamp()}】抢先交易失败`, error);
    }

    watchStart = 0;
    const banalnceAfter = await provider.getBalance(account.address);
    console.log(`【${timestamp()}】` + '【交易后】余额 - ', ethers.formatEther(banalnceAfter));
    console.log(`【${timestamp()}】` + '【交易完成】收益 - ', ethers.formatEther(banalnceAfter - banalnceBefore));
  }
  // 连续失败多次后，等待10分钟
  if (errorCount > 3) {
    console.log(`【${timestamp()}】` + '连续失败多次后, 等待10分钟');
    await wait(1000 * 60 * 10);
    console.log(`【${timestamp()}】` + '等待结束');
    errorCount = 0;
    gasLevel++;
  } else if (successCount > 3) {
    successCount = 0;
    gasLevel--;
  }
  main();
};

main();
