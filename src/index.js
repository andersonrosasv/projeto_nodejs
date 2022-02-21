require("dotenv-safe").config();
const jwt = require("jsonwebtoken");

const express = require('express');
const {v4: uuidv4} = require("uuid");
const { JsonWebTokenError } = require("jsonwebtoken");
//A versão 4 do uuid coloca números randômicos. Aqui renomeamos essa função para uuidv4 para ficar mais fácil de entender.

const app = express();

app.use(express.json());

const customers = [];
//"banco de dados fake", um array para armazenar temporariamente as contas por enquanto


//Middleware
function verifyIfExistsAccountCPF(request, response, next){
    const { cpf } = request.headers;

    const customer = customers.find((customer)=> customer.cpf === cpf);

    if(!customer){
        return response.status(404).json({error: "Customer not found"});
    };

    request.customer = customer;
    //Passando o customer para as demais rotas que estão chamando nosso middleware

    return next();
};

function verifyJWT(request, response, next){
    const token = request.headers["x-access-token"];
    if(!token)
    return response.status(403).json({auth:false, message: "No token provided."});
    jwt.verify(token, process.env.SECRET, function(err, decoded){
        if (err)
        return response.status(403).json({auth:false, message: "Failed to authenticate token"});

        request.userId = decoded.userId;
        next();
    });
};

function getBalance(statement){
    const balance = statement.reduce((acc, operation) => {
        if (operation.type === "credit"){
            return acc + operation.amount;
        }else{
            return acc - operation.amount;
        };
    }, 0); //passando o parâmetro para iniciar o reduce em 0

    return balance;
};

/* 
cpf: string
name: string
id: uuid
statement (extrato, lançamentos da conta): []
*/

//rota de login para autenticação com jwt
app.post("/login", (request, response, next) => {
    if(request.body.user === "admin" && request.body.password === 123){
        const userId =  uuidv4();
        const token = jwt.sign({userId}, process.env.SECRET, {
            expiresIn: 300
        });
        return response.json({auth: true, token: token, id: userId});
    };
    response.status(401).json({message: "Invalid Login!"});
});

app.post("/logout", function (request, response){
    response.json({auth:false, token:null});
});

app.post("/account", verifyJWT,(request, response) => {
    const {cpf, name} = request.body;

    const customerAlreadyExists = customers.some(
        (customer) => customer.cpf === cpf
    );

    if (customerAlreadyExists) {
        return response.status(409).json({error: "Customer already exists!"}); //conflito
    };

    const customer = {
        cpf,
        name,
        id: request.userId,
        statement:[],
    };

    customers.push(customer);
    //utilizando a função push para inserir os dados dentro do array

    return response.status(201).json(customer);
});

app.get("/statement", verifyIfExistsAccountCPF, (request, response) => {
    const { customer } = request;
    return response.json(customer.statement);
});

app.post("/deposit", verifyIfExistsAccountCPF, (request, response) => {
    const { description, amount } = request.body;

    const { customer } = request;
     
    const statementOperation = {
        description,
        amount,
        created_at: new Date(),
        type: "credit",
    };

    customer.statement.push(statementOperation);
    
    return response.status(201).send();
});

app.post("/withdraw", verifyIfExistsAccountCPF, (request, response) => {
    const { amount } = request.body;
    const { customer } = request;

    const balance = getBalance(customer.statement);

    if (balance < amount){
        return response.status(402).json({error:"Insuficient funds!"});
    };

    const statementOperation = {
        amount,
        created_at: new Date(),
        type: "debit",
    };
    
    customer.statement.push(statementOperation);

    return response.status(201).send();
});

app.get("/statement/date", verifyIfExistsAccountCPF, (request, response) => {
    const { customer } = request;
    const { date } = request.query;

    const dateFormat = new Date(date + " 00:00");
    //definindo o valor da hora como 00:00, assim conseguimos buscar pelo dia independente da hora

    const statement = customer.statement.filter(
        (statement) => statement.created_at.toDateString() 
        === new Date(dateFormat).toDateString());
    //Fazendo o filtro para nos retornar apenas o extrato bancário da data solicitada

    return response.json(statement);
});

app.put("/account", verifyIfExistsAccountCPF, (request, response) => {
    const { name } = request.body;
    const { customer } = request;

    customer.name = name;

    return response.status(200).send();
});

app.get("/account", verifyJWT, verifyIfExistsAccountCPF, (request, response) => {
    const { customer } = request;
    
    return response.json(customer);
});

app.delete("/account", verifyIfExistsAccountCPF, (request, response) => {
    const { customer } = request;

    customers.splice(customer, 1);

    return response.status(200).json(customers);
});

app.get("/balance", verifyIfExistsAccountCPF, (request, response) => {
    const { customer } = request;

    const balance = getBalance(customer.statement);

    return response.json(balance);
});

app.listen(3031);