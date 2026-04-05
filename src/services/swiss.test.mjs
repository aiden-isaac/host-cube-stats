import { describe, it, expect } from 'vitest';
import swissModule from './swiss.js';

const { generateSwissPairings } = swissModule;

const players = [
    { user_id: 1, username: 'alice', display_name: 'Alice' },
    { user_id: 2, username: 'bruno', display_name: 'Bruno' },
    { user_id: 3, username: 'cora', display_name: 'Cora' }
];

describe('generateSwissPairings', () => {
    it('uses the dedicated three-player opening pairing without a bye match', () => {
        const pairings = generateSwissPairings(players, [], []);

        expect(pairings).toEqual([
            {
                player1Id: 1,
                player2Id: 2,
                player1Name: 'Alice',
                player2Name: 'Bruno'
            }
        ]);
    });

    it('pairs the waiting player against the loser of round one', () => {
        const previousMatches = [
            {
                id: 11,
                round_number: 1,
                player1_id: 1,
                player2_id: 2,
                player1_wins: 2,
                player2_wins: 0
            }
        ];

        const pairings = generateSwissPairings(players, [], previousMatches);

        expect(pairings).toEqual([
            {
                player1Id: 3,
                player2Id: 2,
                player1Name: 'Cora',
                player2Name: 'Bruno'
            }
        ]);
    });

    it('finishes with the remaining unplayed pairing in round three', () => {
        const previousMatches = [
            {
                id: 11,
                round_number: 1,
                player1_id: 1,
                player2_id: 2,
                player1_wins: 2,
                player2_wins: 0
            },
            {
                id: 12,
                round_number: 2,
                player1_id: 3,
                player2_id: 2,
                player1_wins: 2,
                player2_wins: 1
            }
        ];

        const pairings = generateSwissPairings(players, [], previousMatches);

        expect(pairings).toEqual([
            {
                player1Id: 1,
                player2Id: 3,
                player1Name: 'Alice',
                player2Name: 'Cora'
            }
        ]);
    });

    it('returns no pairings once all three unique matches already exist', () => {
        const previousMatches = [
            { id: 11, round_number: 1, player1_id: 1, player2_id: 2, player1_wins: 2, player2_wins: 0 },
            { id: 12, round_number: 2, player1_id: 3, player2_id: 2, player1_wins: 2, player2_wins: 1 },
            { id: 13, round_number: 3, player1_id: 1, player2_id: 3, player1_wins: 1, player2_wins: 2 }
        ];

        expect(generateSwissPairings(players, [], previousMatches)).toEqual([]);
    });
});
