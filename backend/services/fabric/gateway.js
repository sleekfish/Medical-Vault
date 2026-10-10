/**
 * MediVault Fabric Gateway Service
 *
 * Connects the Windows-hosted backend to the Hyperledger Fabric
 * Healthcare peer running inside Docker.
 *
 * Network:
 *   Channel:  medivault
 *   Chaincode: medivault
 *   MSP:       HealthcareMSP
 *   Peer:      localhost:7051
 *
 * IMPORTANT:
 * The peer is accessed through localhost:7051 from Windows,
 * but its TLS certificate is issued for:
 *
 *   peer0.healthcare.example.com
 *
 * Therefore grpc.ssl_target_name_override is required.
 */

import { connect, signers } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * gateway.js
 *   backend/services/fabric/gateway.js
 *
 * PROJECT_ROOT
 *   Medical-Vault/
 */
const PROJECT_ROOT = path.resolve(__dirname, '../../..');


class FabricGateway {

    #gateway = null;
    #client = null;
    #network = null;
    #contract = null;
    #connected = false;


    /**
     * Connect to Hyperledger Fabric Gateway.
     */
    async connect({

                      /*
                       * Backend runs on Windows.
                       * Fabric peer is exposed through Docker on localhost:7051.
                       */
                      peerEndpoint =
                          process.env.FABRIC_PEER_ENDPOINT ||
                          'localhost:7051',

                      /*
                       * TLS CA certificate of the Healthcare peer.
                       */
                      tlsCertPath =
                      process.env.FABRIC_PEER_TLS_CERT_PATH,

                      /*
                       * Healthcare Admin certificate.
                       */
                      certPath =
                      process.env.FABRIC_USER_CERT_PATH,

                      /*
                       * Directory containing Healthcare Admin private key.
                       */
                      keyDir =
                      process.env.FABRIC_USER_KEY_PATH,

                      /*
                       * Fabric MSP.
                       */
                      mspId =
                          process.env.FABRIC_MSP_ID ||
                          'HealthcareMSP',

                      /*
                       * Channel.
                       */
                      channelName =
                          process.env.FABRIC_CHANNEL_NAME ||
                          'medivault',

                      /*
                       * Chaincode.
                       */
                      chaincodeName =
                          process.env.FABRIC_CHAINCODE_NAME ||
                          'medivault',

                      /*
                       * IMPORTANT:
                       *
                       * The connection is made to:
                       *
                       *     localhost:7051
                       *
                       * but the TLS certificate belongs to:
                       *
                       *     peer0.healthcare.example.com
                       *
                       * This fixes:
                       *
                       * ERR_TLS_CERT_ALTNAME_INVALID
                       */
                      tlsServerName =
                          process.env.FABRIC_PEER_TLS_SERVER_NAME ||
                          'peer0.healthcare.example.com'

                  } = {}) {

        /*
         * Don't create another connection if already connected.
         */
        if (this.#connected) {
            return;
        }


        /**
         * Resolve relative paths against project root.
         */
        const resolvePath = (filePath) => {

            if (!filePath) {
                return null;
            }

            return path.isAbsolute(filePath)
                ? filePath
                : path.join(PROJECT_ROOT, filePath);
        };


        const tlsCertAbs = resolvePath(tlsCertPath);
        const certAbs = resolvePath(certPath);
        const keyDirAbs = resolvePath(keyDir);


        /*
         * Print configuration for debugging.
         */
        console.log('');
        console.log('========================================');
        console.log('[Fabric] Initializing Gateway');
        console.log('========================================');
        console.log(`[Fabric] Peer endpoint: ${peerEndpoint}`);
        console.log(`[Fabric] TLS server name: ${tlsServerName}`);
        console.log(`[Fabric] MSP: ${mspId}`);
        console.log(`[Fabric] Channel: ${channelName}`);
        console.log(`[Fabric] Chaincode: ${chaincodeName}`);
        console.log(`[Fabric] TLS certificate: ${tlsCertAbs}`);
        console.log(`[Fabric] User certificate: ${certAbs}`);
        console.log(`[Fabric] Private key directory: ${keyDirAbs}`);
        console.log('');


        /*
         * Validate required paths.
         */
        if (!tlsCertAbs) {
            throw new Error(
                'FABRIC_PEER_TLS_CERT_PATH is not configured.'
            );
        }

        if (!certAbs) {
            throw new Error(
                'FABRIC_USER_CERT_PATH is not configured.'
            );
        }

        if (!keyDirAbs) {
            throw new Error(
                'FABRIC_USER_KEY_PATH is not configured.'
            );
        }


        /*
         * Validate TLS certificate.
         */
        if (!fs.existsSync(tlsCertAbs)) {

            throw new Error(
                `Fabric TLS certificate not found: ${tlsCertAbs}`
            );

        }


        /*
         * Validate user certificate.
         */
        if (!fs.existsSync(certAbs)) {

            throw new Error(
                `Fabric user certificate not found: ${certAbs}`
            );

        }


        /*
         * Validate private-key directory.
         */
        if (!fs.existsSync(keyDirAbs)) {

            throw new Error(
                `Fabric private key directory not found: ${keyDirAbs}`
            );

        }


        /*
         * Find private key.
         *
         * Cryptogen normally generates:
         *
         *     priv_sk
         *
         * but some setups may use .pem files.
         */
        const keyFiles = fs.readdirSync(keyDirAbs)
            .filter((fileName) =>
                fileName.endsWith('_sk') ||
                fileName.endsWith('.pem') ||
                fileName === 'priv_sk'
            );


        if (keyFiles.length === 0) {

            throw new Error(
                `No private key found in ${keyDirAbs}`
            );

        }


        /*
         * Use the first valid private key.
         */
        const keyAbs = path.join(
            keyDirAbs,
            keyFiles[0]
        );


        console.log(
            `[Fabric] Private key: ${keyAbs}`
        );


        /*
         * Read credentials.
         */
        const tlsCert =
            fs.readFileSync(tlsCertAbs);

        const cert =
            fs.readFileSync(certAbs);

        const privateKeyBytes =
            fs.readFileSync(keyAbs);


        /**
         * ---------------------------------------------------------
         * TLS CONFIGURATION
         * ---------------------------------------------------------
         *
         * The Docker port is:
         *
         *     localhost:7051
         *
         * But certificate SAN:
         *
         *     DNS:peer0.healthcare.example.com
         *
         * Therefore grpc must use:
         *
         *     peer0.healthcare.example.com
         *
         * as the TLS target name.
         */
        const tlsCredentials =
            grpc.credentials.createSsl(
                tlsCert
            );


        /*
         * Create the gRPC client.
         *
         * grpc.ssl_target_name_override tells gRPC:
         *
         * "Although I am connecting to localhost,
         *  validate the TLS certificate as
         *  peer0.healthcare.example.com."
         */
        this.#client =
            new grpc.Client(
                peerEndpoint,
                tlsCredentials,
                {
                    'grpc.ssl_target_name_override':
                    tlsServerName,

                    'grpc.default_authority':
                    tlsServerName
                }
            );


        /*
         * Create Fabric identity.
         */
        const identity = {

            mspId,

            credentials: cert

        };


        /*
         * Convert private key into a Node.js KeyObject.
         */
        const privateKey =
            crypto.createPrivateKey(
                privateKeyBytes
            );


        /*
         * Create Fabric transaction signer.
         */
        const signer =
            signers.newPrivateKeySigner(
                privateKey
            );


        /*
         * Connect Fabric Gateway.
         */
        this.#gateway =
            connect({

                client: this.#client,

                identity,

                signer,

                /*
                 * Query timeout.
                 */
                evaluateOptions: () => ({

                    deadline:
                        Date.now() + 10000

                }),

                /*
                 * Endorsement timeout.
                 */
                endorseOptions: () => ({

                    deadline:
                        Date.now() + 30000

                }),

                /*
                 * Submit timeout.
                 */
                submitOptions: () => ({

                    deadline:
                        Date.now() + 15000

                }),

                /*
                 * Commit timeout.
                 */
                commitStatusOptions: () => ({

                    deadline:
                        Date.now() + 60000

                })

            });


        /*
         * Get channel network.
         */
        this.#network =
            this.#gateway.getNetwork(
                channelName
            );


        /*
         * Get chaincode contract.
         */
        this.#contract =
            this.#network.getContract(
                chaincodeName
            );


        /*
         * Mark connection as active.
         */
        this.#connected = true;


        console.log('');
        console.log('========================================');
        console.log('[Fabric] Connected successfully');
        console.log('========================================');
        console.log(
            `[Fabric] Channel: ${channelName}`
        );
        console.log(
            `[Fabric] Chaincode: ${chaincodeName}`
        );
        console.log(
            `[Fabric] MSP: ${mspId}`
        );
        console.log(
            `[Fabric] Gateway peer: ${peerEndpoint}`
        );
        console.log(
            `[Fabric] TLS hostname: ${tlsServerName}`
        );
        console.log('========================================');
        console.log('');
    }


    /**
     * Submit a blockchain transaction.
     *
     * Example:
     *
     * await gateway.submitTransaction(
     *     'CreateMedicalRecord',
     *     documentId,
     *     patientId,
     *     cid,
     *     hash,
     *     documentType,
     *     fileName
     * );
     */
    async submitTransaction(
        functionName,
        ...args
    ) {

        this.#ensureConnected();


        console.log(
            `[Fabric] Submitting transaction: ${functionName}`
        );

        console.log(
            '[Fabric] Arguments:',
            args
        );


        try {

            const resultBytes =
                await this.#contract.submitTransaction(
                    functionName,
                    ...args
                );


            const result =
                Buffer
                    .from(resultBytes)
                    .toString('utf8');


            console.log(
                `[Fabric] Transaction successful: ${functionName}`
            );


            /*
             * Chaincode functions return JSON strings.
             */
            if (!result) {
                return null;
            }


            try {

                return JSON.parse(result);

            } catch {

                /*
                 * If a chaincode function returns
                 * plain text instead of JSON.
                 */
                return result;

            }

        } catch (error) {

            console.error(
                `[Fabric] Transaction failed: ${functionName}`
            );

            console.error(
                '[Fabric] Error:',
                error
            );

            throw error;
        }
    }


    /**
     * Evaluate a read-only Fabric transaction.
     *
     * Example:
     *
     * await gateway.evaluateTransaction(
     *     'GetMedicalRecord',
     *     documentId,
     *     requesterId
     * );
     */
    async evaluateTransaction(
        functionName,
        ...args
    ) {

        this.#ensureConnected();


        console.log(
            `[Fabric] Evaluating transaction: ${functionName}`
        );

        console.log(
            '[Fabric] Arguments:',
            args
        );


        try {

            const resultBytes =
                await this.#contract.evaluateTransaction(
                    functionName,
                    ...args
                );


            const result =
                Buffer
                    .from(resultBytes)
                    .toString('utf8');


            console.log(
                `[Fabric] Query successful: ${functionName}`
            );


            if (!result) {
                return null;
            }


            try {

                return JSON.parse(result);

            } catch {

                return result;

            }

        } catch (error) {

            console.error(
                `[Fabric] Query failed: ${functionName}`
            );

            console.error(
                '[Fabric] Error:',
                error
            );

            throw error;
        }
    }


    /**
     * Disconnect from Fabric.
     */
    async disconnect() {

        console.log(
            '[Fabric] Disconnecting...'
        );


        if (this.#gateway) {

            this.#gateway.close();

        }


        if (this.#client) {

            this.#client.close();

        }


        this.#gateway = null;

        this.#client = null;

        this.#network = null;

        this.#contract = null;

        this.#connected = false;


        console.log(
            '[Fabric] Disconnected'
        );
    }


    /**
     * Check connection status.
     */
    get isConnected() {

        return this.#connected;

    }


    /**
     * Internal connection check.
     */
    #ensureConnected() {

        if (!this.#connected) {

            throw new Error(
                'Fabric Gateway not connected. Call connect() first.'
            );

        }

    }

}


/*
 * ---------------------------------------------------------
 * SINGLETON
 * ---------------------------------------------------------
 *
 * We use one Fabric Gateway connection for the backend
 * process instead of creating a new connection for every
 * request.
 */
let instance = null;


/**
 * Get the existing Fabric Gateway or create one.
 */
export async function getFabricGateway(
    options
) {

    if (!instance) {

        instance =
            new FabricGateway();

        try {

            await instance.connect(
                options
            );

        } catch (error) {

            /*
             * If connection initialization fails,
             * don't leave a broken singleton behind.
             */
            instance = null;

            throw error;
        }

    }


    return instance;
}


/*
 * Export class for testing.
 */
export {
    FabricGateway
};


export default FabricGateway;