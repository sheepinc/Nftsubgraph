import {
	ethereum,
	Address,
	BigInt,Bytes
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
    Contract,
	Transfer
} from './generated/schema'

function fetchAccount(id:Address) :Account{
	let account = Account.load(id.toHex())
	if(account==null){
		account = new Account(id.toHex())
		account.totalErc1155Owned = BigInt.fromI32(0)
		account.totalErc721Owned = BigInt.fromI32(0)
		account.totalTokensOwned = BigInt.fromI32(0)
	}
	return account as Account
}

function fetchToken(collection:Contract,id:BigInt,type:String):Token{
    let tokenid= collection.id.concat("_").concat(id.toHex())
    let token= Token.load(tokenid);
    if (token == null) {
		token = new Token(tokenid)
		token.contract    = collection.id
		token.tokenID  = id
        token.type = type.toString()
		token.totalSupply = BigInt.fromI32(1)
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
    let registry = fetchCollection(event.address,"e1155")
	registry.save()

	let token = fetchToken(registry, event.params._id,"e1155")
	token.creator= event.transaction.from.toHex()
	token.URI = event.params._value
	token.save()
}

export function handleTransferSingle(event: TransferSingleEvent): void
{
	let registry = fetchCollection(event.address,"e1155")
	let operator = fetchAccount(event.params._operator)
	let from     = fetchAccount(event.params._from)
	let to       = fetchAccount(event.params._to)
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
		event.params._id,
		event.params._value,
        "e1155"
	)
}

export function handleTransferBatch(event: TransferBatchEvent): void
{
	let registry = fetchCollection(event.address,"e1155")
	let operator = fetchAccount(event.params._operator)
	let from     = fetchAccount(event.params._from)
	let to       = fetchAccount(event.params._to)
	registry.save()
	operator.save()
	from.save()
	to.save()

	let ids    = event.params._ids
	let values = event.params._values
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
            "e1155"
		)
	}
}

function toBytes(hexString: String): Bytes {
    let result = new Uint8Array(hexString.length/2);
    for (let i = 0; i < hexString.length; i += 2) {
        result[i/2] = parseInt(hexString.substr(i, 2), 16) as u32;
    }
    return result as Bytes;
}

function supportsInterface721(contract: IERC721, interfaceId: String, expected : boolean = true) : boolean {
    let supports = contract.try_supportsInterface(toBytes(interfaceId));
    return !supports.reverted && supports.value == expected;
}

function supportsInterface1155(contract: IERC1155, interfaceId: String, expected : boolean = true) : boolean {
    let supports = contract.try_supportsInterface(toBytes(interfaceId));
    return !supports.reverted && supports.value == expected;
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
    type:     String)
: void{
    let token = fetchToken(collection,id,type)
	let ev = new Transfer(events.id(event).concat(suffix.toString()))
	ev.transaction = transactions.log(event).id
	ev.timestamp   = event.block.timestamp
	ev.token       = token.id
	ev.operator    = operator.id
	ev.from        = from.id
	ev.to          = to.id
	ev.value       = value

    if (from.id == constants.ADDRESS_ZERO) {
		collection.totalSupply = collection.totalSupply.plus(BigInt.fromI32(1))
		token.mintTimeStamp=event.block.timestamp	
		if(type=="e721"){
			let tokenB = IERC721.bind(event.address) 
			let supportsEIP165Identifier = supportsInterface721(tokenB, '01ffc9a7');
			let supportsEIP721Identifier = supportsInterface721(tokenB, '80ac58cd');
			let supportsNullIdentifierFalse = supportsInterface721(tokenB, '00000000', false);
			let supportsEIP721 = supportsEIP165Identifier && supportsEIP721Identifier && supportsNullIdentifierFalse;
			if(supportsEIP721){
				let URI = tokenB.try_tokenURI(id);
				token.creator= to.id
				if(!URI.reverted){
					token.URI= normalize(URI.value)
				}
			}
		}else{
			token.totalSupply = BigInt.fromI32(1)
		}
	} else {
		let balance = fetchBalance(token, from)
		balance.amount = balance.amount.minus(BigInt.fromI32(1))
		balance.save()
		from.totalTokensOwned.plus(BigInt.fromI32(1))
		if(type=="e721"){
			from.totalErc721Owned.plus(BigInt.fromI32(1))
		}else{
			from.totalErc1155Owned.plus(BigInt.fromI32(1))
		}
		ev.fromBalance = balance.id
	}

	if (to.id == constants.ADDRESS_ZERO) {
		collection.totalSupply = collection.totalSupply.minus(value)
		token.totalSupply = token.totalSupply.minus(value)
	} else {
		let balance = fetchBalance(token, to)
		balance.amount = balance.amount.plus(value)
		balance.save()
		to.totalTokensOwned.minus(BigInt.fromI32(1))
		if(type=="e721"){
			to.totalErc721Owned.minus(BigInt.fromI32(1))
		}else{
			to.totalErc1155Owned.minus(BigInt.fromI32(1))
		}
		ev.toBalance = balance.id
	}
	from.save()
	to.save()
	token.save()
	ev.save();
}

function normalize(strValue: string): string {
    if (strValue.length === 1 && strValue.charCodeAt(0) === 0) {
        return "";    
    } else {
        for (let i = 0; i < strValue.length; i++) {
            if (strValue.charCodeAt(i) === 0) {
                strValue = setCharAt(strValue, i, '\ufffd'); // graph-node db does not support string with '\u0000'
            }
        }
        return strValue;
    }
}
function setCharAt(str: string, index: i32, char: string): string {
    if(index > str.length-1) return str;
    return str.substr(0,index) + char + str.substr(index+1);
}

function fetchCollection(id:Address,type:string):Contract{
	let collection = Contract.load(id.toHex())
	if(collection==null && type=="e721"){
		let contract= IERC721.bind(id)
		collection= new Contract(id.toHex())
		collection.totalSupply=constants.BIGINT_ZERO
		let name =contract.try_name()
		if(!name.reverted) {
			collection.name = normalize(name.value);
		}else{
			collection.name="NONAME"
		}
		
		let symbol =contract.try_symbol()
		if(!symbol.reverted) {
			collection.symbol = normalize(symbol.value);
		}else{
			collection.symbol="NONE"
		}
		collection.URI = ""
	}else if(collection==null && type=="e1155"){
		let contract= IERC1155.bind(id)
		collection= new Contract(id.toHex())
		collection.totalSupply= constants.BIGINT_ZERO;
		let name =contract.try_name()
		if(!name.reverted) {
			collection.name = normalize(name.value);
		}else{
			collection.name="NONAME"
		}
		let symbol =contract.try_symbol()
		if(!symbol.reverted) {
			collection.symbol = normalize(symbol.value);
		}
		else{
			collection.symbol="NONE"
		}
		collection.URI="";
		let URI =contract.try_tokenURIPrefix()
		if(!URI.reverted) {
			collection.URI = normalize(URI.value);
		}else{
			collection.URI="NONE"
		}
	}
	return collection as Contract
}

export function handleTransfer(event:Transfer721):void{
    let registry = fetchCollection(event.address,"e721")
	let operator = fetchAccount(event.params.from)
	let from     = fetchAccount(event.params.from)
	let to       = fetchAccount(event.params.to)
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
		BigInt.fromI32(1),
        "e721"
	)
}

/*
test query
{
  contracts(first:100,orderBy:name,orderDirection:desc){
    name
    symbol
    totalSupply
  }
}

*/
