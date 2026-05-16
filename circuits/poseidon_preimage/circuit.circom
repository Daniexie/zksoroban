pragma circom 2.1.9;

include "circomlib/circuits/poseidon.circom";

template PoseidonPreimage() {
    signal input secret;
    signal input commitment;

    component hash = Poseidon(1);
    hash.inputs[0] <== secret;

    commitment === hash.out;
}

component main {public [commitment]} = PoseidonPreimage();
