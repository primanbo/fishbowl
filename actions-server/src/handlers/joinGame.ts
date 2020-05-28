import { Request, Response } from "express"
import { GraphQLClient } from "graphql-request"
import jwt from "jsonwebtoken"
import { getSdk } from "../generated/graphql"

// Request Handler
const handler = async (req: Request, res: Response) => {
  if (!process.env.HASURA_ENDPOINT || !process.env.HASURA_GRAPHQL_JWT_SECRET) {
    return res.status(500)
  }
  const client = new GraphQLClient(process.env.HASURA_ENDPOINT)
  const sdk = getSdk(client)

  // get request input
  const { gameId, clientUuid } = req.body.input

  // execute the Hasura operation(s)
  let playerId

  try {
    const { players } = await sdk.LookupPlayerForGame({
      gameId,
      clientUuid,
    })
    if (players[0]) {
      // already joined game
      playerId = players[0].id
    } else {
      // new player for game
      try {
        const { insert_players_one } = await sdk.InsertPlayerForGame({
          gameId,
          clientUuid,
        })
        if (insert_players_one) {
          playerId = insert_players_one.id
        }
      } catch {
        return res.status(400)
      }
    }

    if (!playerId) {
      return res.status(500)
    }

    const tokenContents = {
      sub: playerId.toString(),
      iat: Date.now() / 1000,
      iss: "https://fishbowl-game.com/",
      "https://hasura.io/jwt/claims": {
        "x-hasura-allowed-roles": ["player", "anonymous"],
        "x-hasura-user-id": playerId.toString(),
        "x-hasura-default-role": "player",
        "x-hasura-role": "player",
      },
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    }

    const token = jwt.sign(
      tokenContents,
      process.env.HASURA_GRAPHQL_JWT_SECRET || "missing secret"
    )

    return res.json({
      id: playerId.toString(),
      jwt_token: token,
    })
  } catch {
    return res.status(400)
  }
}

module.exports = handler
