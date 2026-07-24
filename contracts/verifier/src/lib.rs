#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine, BN254_G1_SERIALIZED_SIZE, BN254_G2_SERIALIZED_SIZE},
    vec, Address, Bytes, BytesN, Env, String, TryFromVal, Vec,
};

const PROOF_A_LEN: usize = BN254_G1_SERIALIZED_SIZE;
const PROOF_B_LEN: usize = BN254_G2_SERIALIZED_SIZE;
const CIRCUIT_PUBLIC_INPUT_COUNT: u32 = 1;
const EXPECTED_PUBLIC_INPUT_COUNT: u32 = CIRCUIT_PUBLIC_INPUT_COUNT + 1;
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha: BytesN<64>,
    pub beta: BytesN<128>,
    pub gamma: BytesN<128>,
    pub delta: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
#[derive(Clone)]
pub struct Limits {
    pub max_calls: u32,
    pub window_size: u32,
}

#[contracttype]
enum DataKey {
    Admin,
    Limits,
    Vk,
    CallCount(Address, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    RateLimitExceeded = 2,
    InvalidWindowSize = 3,
    ProofExpired = 4,
    InvalidVerifyingKey = 5,
}

#[contract]
pub struct VerifierContract;

#[contractimpl]
impl VerifierContract {
    pub fn __constructor(env: Env, admin: Address, max_calls: u32, window_size: u32, vk: VerifyingKey) {
        assert!(window_size > 0, "window_size must be positive");
        assert!(
            vk.ic.len() == EXPECTED_PUBLIC_INPUT_COUNT,
            "verifying key ic length must equal EXPECTED_PUBLIC_INPUT_COUNT"
        );

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Limits, &Limits { max_calls, window_size });
        env.storage().instance().set(&DataKey::Vk, &vk);
    }

    pub fn limits(env: Env) -> Limits {
        env.storage()
            .instance()
            .get(&DataKey::Limits)
            .expect("contract is not initialized")
    }

    pub fn version(env: Env) -> String {
        String::from_str(&env, CONTRACT_VERSION)
    }

    pub fn set_limits(env: Env, max_calls: u32, window_size: u32) -> Result<(), Error> {
        if window_size == 0 {
            return Err(Error::InvalidWindowSize);
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::Limits, &Limits { max_calls, window_size });
        Ok(())
    }

    pub fn update_vk(env: Env, vk: VerifyingKey) -> Result<(), Error> {
        if vk.ic.len() != EXPECTED_PUBLIC_INPUT_COUNT {
            return Err(Error::InvalidVerifyingKey);
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Vk, &vk);
        Ok(())
    }

    pub fn verify_proof(
        env: Env,
        caller: Address,
        proof_a: Bytes,
        proof_b: Bytes,
        proof_c: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> Result<bool, Error> {
        caller.require_auth();

        let limits: Limits = env
            .storage()
            .instance()
            .get(&DataKey::Limits)
            .ok_or(Error::NotInitialized)?;

        let ledger = env.ledger().sequence();
        let window_start = ledger - (ledger % limits.window_size);
        let count_key = DataKey::CallCount(caller.clone(), window_start);
        let current: u32 = env.storage().instance().get(&count_key).unwrap_or(0);
        let next = current + 1;
        if next > limits.max_calls {
            return Err(Error::RateLimitExceeded);
        }
        env.storage().instance().set(&count_key, &next);

        let proof_a = read_g1(&env, &proof_a, "proof_a");
        let proof_b = read_g2(&env, &proof_b, "proof_b");
        let proof_c = read_g1(&env, &proof_c, "proof_c");

        if public_inputs.len() != EXPECTED_PUBLIC_INPUT_COUNT {
            return Ok(false);
        }

        let expiry_ledger = match read_expiry_ledger(&public_inputs.get(1).unwrap()) {
            Some(value) => value,
            None => return Ok(false),
        };

        if ledger > expiry_ledger {
            return Err(Error::ProofExpired);
        }

        let vk: VerifyingKey = env
            .storage()
            .instance()
            .get(&DataKey::Vk)
            .ok_or(Error::NotInitialized)?;

        let vk_alpha = Bn254G1Affine::from_bytes(vk.alpha);
        let vk_beta = Bn254G2Affine::from_bytes(vk.beta);
        let vk_gamma = Bn254G2Affine::from_bytes(vk.gamma);
        let vk_delta = Bn254G2Affine::from_bytes(vk.delta);
        let vk_ic0 = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
        let vk_ic1 = Bn254G1Affine::from_bytes(vk.ic.get(1).unwrap());

        let public_input = Bn254Fr::from_bytes(public_inputs.get(0).unwrap());
        let vk_x = vk_ic0 + (vk_ic1 * public_input);

        let verified = env.crypto().bn254().pairing_check(
            vec![&env, proof_a, -vk_alpha, -vk_x, -proof_c],
            vec![&env, proof_b, vk_beta, vk_gamma, vk_delta],
        );

        Ok(verified)
    }
}

fn read_expiry_ledger(bytes: &BytesN<32>) -> Option<u32> {
    let arr = bytes.to_array();
    let mut i = 0;
    while i < 28 {
        if arr[i] != 0 {
            return None;
        }
        i += 1;
    }
    Some(u32::from_be_bytes([arr[28], arr[29], arr[30], arr[31]]))
}

fn read_g1(env: &Env, bytes: &Bytes, label: &str) -> Bn254G1Affine {
    assert_eq!(bytes.len(), PROOF_A_LEN as u32, "{label} must be 64 bytes");
    let bytesn = BytesN::<PROOF_A_LEN>::try_from_val(env, bytes.as_val())
        .expect("proof bytes must be convertible to BytesN<64>");
    Bn254G1Affine::from_bytes(bytesn)
}

fn read_g2(env: &Env, bytes: &Bytes, label: &str) -> Bn254G2Affine {
    assert_eq!(bytes.len(), PROOF_B_LEN as u32, "{label} must be 128 bytes");
    let bytesn = BytesN::<PROOF_B_LEN>::try_from_val(env, bytes.as_val())
        .expect("proof bytes must be convertible to BytesN<128>");
    Bn254G2Affine::from_bytes(bytesn)
}

#[cfg(test)]
mod tests;
