import {
	ethereum,
	Address,
	BigInt,
} from '@graphprotocol/graph-ts'

import {
	constants,
	events,
	integers,
	transactions,
} from '@amxx/graphprotocol-utils'

import {
    IERC1155,
	TransferBatch  as TransferBatchEvent,
	TransferSingle as TransferSingleEvent,
	URI            as URIEvent,
} from "./generated/IERC1155/IERC1155"
import { Transfer as Transfer721 , IERC721 } from './generated/IERC1155/IERC721';
import {
    Account,
    Token,
    Balance,
    Contract
} from './generated/schema'
import { handleTransfer } from '../eip721-subgraph/src/mapping';

enum tokenType {e721,e1155}

function fetchToken(collection:Contract,id:BigInt,type:tokenType):Token{
    let tokenid= collection.id.concat("-").concat(id.toHex())
    let token= Token.load(tokenid);
    if (token == null) {
		token = new Token(tokenid)
		token.contract    = collection.id
		token.tokenID  = id
        token.type = type.toString()
		token.totalSupply = constants.BIGINT_ZERO
	}
    return token as Token
}

function fetchBalance(token: Token, account: Account): Balance {
	let balanceid = token.id.concat('-').concat(account.id)
	let balance = Balance.load(balanceid)
	if (balance == null) {
		balance = new Balance(balanceid)
		balance.token   = token.id
		balance.owner = account.id
		balance.amount   = constants.BIGINT_ZERO
	}
	return balance as Balance
}

export function handleURI(event:URIEvent):void{
    let registry = new Contract(event.address.toHex())
	registry.save()

	let token = fetchToken(registry, event.params.id)
	token.URI = event.params.value
	token.save()
}

export function handleTransferSingle(event: TransferSingleEvent): void
{
	let registry = new Contract(event.address.toHex())
	let operator = new Account(event.params.operator.toHex())
	let from     = new Account(event.params.from.toHex())
	let to       = new Account(event.params.to.toHex())
	registry.save()
	operator.save()
	from.save()
	to.save()

	registerTransfer(
		event,
		"",
		registry,
		operator,
		from,
		to,
		event.params.id,
		event.params.value,
        tokenType.e1155
	)
}

export function handleTransferBatch(event: TransferBatchEvent): void
{
	let registry = new Contract(event.address.toHex())
	let operator = new Account(event.params.operator.toHex())
	let from     = new Account(event.params.from.toHex())
	let to       = new Account(event.params.to.toHex())
	registry.save()
	operator.save()
	from.save()
	to.save()

	let ids    = event.params.ids
	let values = event.params.values
	for (let i = 0;  i < ids.length; ++i)
	{
		registerTransfer(
			event,
			"-".concat(i.toString()),
			registry,
			operator,
			from,
			to,
			ids[i],
			values[i],
            tokenType.e1155
		)
	}
}

function registerTransfer(
	event:    ethereum.Event,
	suffix:   String,
	collection: Contract,
	operator: Account,
	from:     Account,
	to:       Account,
	id:       BigInt,
	value:    BigInt,
    type:     tokenType)
: void{
    let token = fetchToken(collection,id,type)
    if (from.id == constants.ADDRESS_ZERO) {
		token.totalSupply = integers.increment(token.totalSupply, value)
	} else {
		let balance = fetchBalance(token, from)
		balance.amount = integers.decrement(balance.amount, value)
		balance.save()
	}

	if (to.id == constants.ADDRESS_ZERO) {
		token.totalSupply = integers.decrement(token.totalSupply, value)
	} else {
		let balance = fetchBalance(token, to)
		balance.amount = integers.increment(balance.amount, value)
		balance.save()
	}

	token.save()
}

export function handleTransfer(event:Transfer721):void{
    let registry = new Contract(event.address.toHex())
	let operator = new Account(event.params.from.toHex())
	let from     = new Account(event.params.from.toHex())
	let to       = new Account(event.params.to.toHex())
	registry.save()
	operator.save()
	from.save()
	to.save()
    registerTransfer(
		event,
		"",
		registry,
		operator,
		from,
		to,
		event.params.tokenId,
		new BigInt(1),
        tokenType.e721
	)
}
