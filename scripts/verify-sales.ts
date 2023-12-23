import { reduce, uniq, concat } from 'lodash'
import BigNumber from 'bignumber.js'
import MerkleTree from 'merkletreejs'
import { keccak256, solidityPackedKeccak256 } from 'ethers'
import fs from 'fs'

BigNumber.config({
  EXPONENTIAL_AT: 1e9,
})

const CampaignResults = require('./campaign-results-json.json')

function verify() {
  //! config
  const rootToVerify =
    '0x3e063887ba186cad025ff17bacef35ae0df83402029ff14e56faa018ecaf94ce'
  const rate = 10 // 1 launch = 10 usdc contribute

  //! (1) get values
  // get user list
  const userByCampaign = Object.values(CampaignResults).map((i) =>
    i.campaignRecords.map((r) => r.user.toLowerCase())
  )
  const userList = uniq(concat(...userByCampaign))
  console.log('userList length', userList.length)

  // get values
  const userListData = userList.map((user, index) => {
    const data = reduce(
      CampaignResults,
      (result, value, key) => {
        const record = value.campaignRecords.find(
          (c) => c.user.toLowerCase() === user.toLowerCase()
        )
        if (!!record) {
          result.num_projects_bought += 1
          result.total_bought = result.total_bought.plus(
            BigNumber(record.currencyPurchased)
              .multipliedBy(value.usdPerCurrency)
              .shiftedBy(18 - value.currencyDecimals) //get 18 decimal value
              .decimalPlaces(0, BigNumber.ROUND_DOWN)
          )
        }
        return result
      },
      {
        user: user,
        index: index,
        num_projects_bought: 0,
        total_bought: BigNumber(0),
      }
    )

    const amount_claimable = data.total_bought
      .dividedBy(rate)
      .dp(0, BigNumber.ROUND_DOWN)

    return {
      ...data,
      amount_claimable,
    }
  })

  //! (2) Create tree
  //values: id, numProjectsBought, totalBought, amountClaimable, user
  const values = userListData.map((i) => {
    const item = [
      i.index,
      i.num_projects_bought,
      i.total_bought.toString(),
      i.amount_claimable.toString(),
      i.user,
    ]
    return {
      item,
      leave: solidityPackedKeccak256(
        ['uint256', 'uint256', 'uint256', 'uint256', 'address'],
        item
      ),
      proofs: null,
    }
  })

  const tree = new MerkleTree(
    values.map((i) => i.leave),
    keccak256,
    {
      sortLeaves: true,
      sort: true,
    }
  )
  const root = tree.getHexRoot()

  //! (3) verify
  console.log('is same root:', root, rootToVerify === root)
  const invalidValue = []
  values.forEach((i) => {
    const proofs = tree.getHexProof(i.leave)
    i.proofs = proofs

    if (!tree.verify(proofs, i.leave, rootToVerify)) {
      invalidValue.push(i)
    }
  })

  if (invalidValue.length > 0) {
    console.log('invalid proof')
  } else console.log('valid proof')

  fs.writeFileSync('./scripts/tree.json', JSON.stringify(values))
  console.log('writed tree.json')
  //check value from json
  // values.map((i, index) => {
  //     const find = Merkle.find(
  //         (m) =>
  //             m.index === i[0] &&
  //             m.num_projects_bought === i[1] &&
  //             m.total_bought === i[2] &&
  //             m.amount_claimable === i[3] &&
  //             m.user === i[4]
  //     )
  //     if (!find) {
  //         console.log('invalid: ', index, i, find)
  //     }
  // })
}

// No parameters are passed
verify()
