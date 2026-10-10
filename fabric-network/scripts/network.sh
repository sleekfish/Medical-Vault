#!/bin/bash
#
# MediVault Hyperledger Fabric Network Control Script
# Run from the fabric-network/ directory
#
# Usage:
#   ./scripts/network.sh generate       Generate crypto material
#   ./scripts/network.sh up             Start Fabric network
#   ./scripts/network.sh createChannel  Create channel and join peers
#   ./scripts/network.sh deployChaincode Package, install, approve, commit chaincode
#   ./scripts/network.sh down           Stop and remove containers
#   ./scripts/network.sh cleanup        Remove all generated files
#   ./scripts/network.sh full           Run generate + up + createChannel + deployChaincode
#

set -e

# Prevent Git Bash / MSYS on Windows from rewriting Unix-style container
# paths (e.g. /opt/gopath/src/chaincode) into Windows paths before they
# reach `docker exec`. Without this, arguments like /opt/gopath/src/chaincode
# get mangled into C:/Program Files/Git/opt/gopath/src/chaincode and every
# docker exec call referencing an in-container path fails.
export MSYS_NO_PATHCONV=1

CHANNEL_NAME="${CHANNEL_NAME:-medivault}"
CHAINCODE_NAME="${CHAINCODE_NAME:-medivault}"
CHAINCODE_VERSION="${CHAINCODE_VERSION:-1.0}"
CHAINCODE_SEQUENCE="${CHAINCODE_SEQUENCE:-1}"
COMPOSE_PROJECT_NAME="medivault"
FABRIC_TOOLS_IMAGE="hyperledger/fabric-tools:2.5"

# Resolve paths relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$NETWORK_DIR"

ORDERER_CA="$NETWORK_DIR/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
HEALTHCARE_PEER_TLS="$NETWORK_DIR/organizations/peerOrganizations/healthcare.example.com/peers/peer0.healthcare.example.com/tls/ca.crt"
INSURANCE_PEER_TLS="$NETWORK_DIR/organizations/peerOrganizations/insurance.example.com/peers/peer0.insurance.example.com/tls/ca.crt"

# ─── Helpers ──────────────────────────────────────────────────────────────────

infoln() { echo -e "\033[0;32m$1\033[0m"; }
errorln() { echo -e "\033[0;31m$1\033[0m"; }

generateCrypto() {
    infoln "Generating crypto material with cryptogen..."
    docker run --rm \
        -v "$NETWORK_DIR:/work" \
        -w /work \
        $FABRIC_TOOLS_IMAGE \
        cryptogen generate --config=crypto-config.yaml --output=organizations

    infoln "Crypto material generated in ./organizations/"
}

createChannelGenesis() {
    infoln "Generating channel genesis block..."
    mkdir -p channel-artifacts

    docker run --rm \
        -v "$NETWORK_DIR:/work" \
        -w /work \
        $FABRIC_TOOLS_IMAGE \
        configtxgen -profile MedivaultChannel \
        -outputBlock ./channel-artifacts/${CHANNEL_NAME}.block \
        -channelID $CHANNEL_NAME

    infoln "Channel genesis block created: ./channel-artifacts/${CHANNEL_NAME}.block"
}

startNetwork() {
    infoln "Starting Fabric network..."
    docker compose -p $COMPOSE_PROJECT_NAME up -d
    sleep 3
    infoln "Fabric network started."
    echo ""
    docker compose -p $COMPOSE_PROJECT_NAME ps
}

joinOrdererToChannel() {
    infoln "Joining orderer to channel..."

    docker exec orderer.example.com osnadmin channel join \
        --channelID $CHANNEL_NAME \
        --config-block /channel-artifacts/${CHANNEL_NAME}.block \
        -o localhost:7053 \
        --ca-file "$ORDERER_CA" \
        --client-cert /var/hyperledger/orderer/tls/server.crt \
        --client-key /var/hyperledger/orderer/tls/server.key

    infoln "Orderer joined channel: $CHANNEL_NAME"
}

joinPeerToChannel() {
    local PEER_NAME=$1
    local PEER_ADDRESS=$2
    local PEER_TLS=$3
    local MSP_ID=$4
    local ADMIN_MSP=$5
    local PEER_TLS_CERT=$6

    infoln "Joining $PEER_NAME to channel..."

    docker exec cli peer channel fetch oldest ./channel-artifacts/${CHANNEL_NAME}.block \
        -o $ORDERER_ENDPOINT \
        -c $CHANNEL_NAME \
        --tls --cafile "$ORDERER_CA"

    docker exec \
        -e CORE_PEER_ADDRESS=$PEER_ADDRESS \
        -e CORE_PEER_LOCALMSPID=$MSP_ID \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/crypto/$ADMIN_MSP \
        -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/crypto/$PEER_TLS_CERT \
        cli peer channel join ./channel-artifacts/${CHANNEL_NAME}.block \
        -o $ORDERER_ENDPOINT \
        --tls --cafile "$ORDERER_CA"

    infoln "$PEER_NAME joined channel: $CHANNEL_NAME"
}

createChannel() {
    createChannelGenesis
    joinOrdererToChannel

    # Healthcare peer
    joinPeerToChannel \
        "peer0.healthcare" \
        "peer0.healthcare.example.com:7051" \
        "" \
        "HealthcareMSP" \
        "peerOrganizations/healthcare.example.com/users/Admin@healthcare.example.com/msp" \
        "peerOrganizations/healthcare.example.com/peers/peer0.healthcare.example.com/tls/ca.crt"

    # Insurance peer
    joinPeerToChannel \
        "peer0.insurance" \
        "peer0.insurance.example.com:9051" \
        "" \
        "InsuranceMSP" \
        "peerOrganizations/insurance.example.com/users/Admin@insurance.example.com/msp" \
        "peerOrganizations/insurance.example.com/peers/peer0.insurance.example.com/tls/ca.crt"
}

deployChaincode() {
    # The chaincode dir may contain a local test stub at
    # chaincode/node_modules/fabric-contract-api (used only for offline unit
    # tests). Remove it and install the genuine packages before packaging so
    # the peer never runs against the stub.
    #
    # NOTE: this runs on the HOST (e.g. via Git Bash on Windows), not inside
    # the `cli` container. The `cli` container is hyperledger/fabric-tools:2.5,
    # which does not ship Node.js/npm. The chaincode/ directory is bind-mounted
    # into the container at /opt/gopath/src/chaincode, so installing
    # dependencies on the host produces the same node_modules the container
    # sees when it packages the chaincode.
    infoln "Preparing chaincode dependencies..."
    rm -rf "$NETWORK_DIR/chaincode/node_modules"
    (cd "$NETWORK_DIR/chaincode" && npm install --production --no-audit --no-fund)

    infoln "Packaging chaincode..."
    docker exec cli peer lifecycle chaincode package \
        ./channel-artifacts/${CHAINCODE_NAME}.tar.gz \
        --path /opt/gopath/src/chaincode \
        --lang node \
        --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}

    # ── Install on Healthcare peer ──
    infoln "Installing chaincode on Healthcare peer..."
    docker exec cli peer lifecycle chaincode install \
        ./channel-artifacts/${CHAINCODE_NAME}.tar.gz

    # Query installed to get package ID
    PACKAGE_ID=$(docker exec cli peer lifecycle chaincode queryinstalled 2>/dev/null \
        | grep "${CHAINCODE_NAME}_${CHAINCODE_VERSION}" \
        | sed -n 's/^Package ID: \(.*\), Label:.*$/\1/p')

    if [ -z "$PACKAGE_ID" ]; then
        errorln "Failed to extract package ID. Check chaincode install logs."
        exit 1
    fi
    infoln "Package ID: $PACKAGE_ID"

    # ── Approve for Healthcare ──
    infoln "Approving chaincode for Healthcare..."
    docker exec cli peer lifecycle chaincode approveformyorg \
        -o $ORDERER_ENDPOINT \
        --channelID $CHANNEL_NAME \
        --name $CHAINCODE_NAME \
        --version $CHAINCODE_VERSION \
        --package-id "$PACKAGE_ID" \
        --sequence $CHAINCODE_SEQUENCE \
        --tls --cafile "$ORDERER_CA"

    # ── Install on Insurance peer ──
    infoln "Installing chaincode on Insurance peer..."
    docker exec \
        -e CORE_PEER_ADDRESS=peer0.insurance.example.com:9051 \
        -e CORE_PEER_LOCALMSPID=InsuranceMSP \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/crypto/peerOrganizations/insurance.example.com/users/Admin@insurance.example.com/msp \
        -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/crypto/peerOrganizations/insurance.example.com/peers/peer0.insurance.example.com/tls/ca.crt \
        cli peer lifecycle chaincode install \
        ./channel-artifacts/${CHAINCODE_NAME}.tar.gz

    # ── Approve for Insurance ──
    infoln "Approving chaincode for Insurance..."
    docker exec \
        -e CORE_PEER_ADDRESS=peer0.insurance.example.com:9051 \
        -e CORE_PEER_LOCALMSPID=InsuranceMSP \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/crypto/peerOrganizations/insurance.example.com/users/Admin@insurance.example.com/msp \
        -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/crypto/peerOrganizations/insurance.example.com/peers/peer0.insurance.example.com/tls/ca.crt \
        cli peer lifecycle chaincode approveformyorg \
        -o $ORDERER_ENDPOINT \
        --channelID $CHANNEL_NAME \
        --name $CHAINCODE_NAME \
        --version $CHAINCODE_VERSION \
        --package-id "$PACKAGE_ID" \
        --sequence $CHAINCODE_SEQUENCE \
        --tls --cafile "$ORDERER_CA"

    # ── Commit ──
    infoln "Committing chaincode..."
    docker exec cli peer lifecycle chaincode commit \
        -o $ORDERER_ENDPOINT \
        --channelID $CHANNEL_NAME \
        --name $CHAINCODE_NAME \
        --version $CHAINCODE_VERSION \
        --sequence $CHAINCODE_SEQUENCE \
        --peerAddresses peer0.healthcare.example.com:7051 \
        --tlsRootCertFiles /opt/gopath/src/crypto/peerOrganizations/healthcare.example.com/peers/peer0.healthcare.example.com/tls/ca.crt \
        --peerAddresses peer0.insurance.example.com:9051 \
        --tlsRootCertFiles /opt/gopath/src/crypto/peerOrganizations/insurance.example.com/peers/peer0.insurance.example.com/tls/ca.crt \
        --tls --cafile "$ORDERER_CA"

    infoln "Chaincode committed: $CHAINCODE_NAME v$CHAINCODE_VERSION (sequence $CHAINCODE_SEQUENCE)"
}

stopNetwork() {
    infoln "Stopping Fabric network..."
    docker compose -p $COMPOSE_PROJECT_NAME down
    infoln "Fabric network stopped."
}

cleanupAll() {
    stopNetwork
    infoln "Removing crypto material and channel artifacts..."
    rm -rf organizations channel-artifacts
    infoln "Cleanup complete."
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "$1" in
    generate)
        generateCrypto
        ;;
    up)
        startNetwork
        ;;
    createChannel)
        createChannel
        ;;
    deployChaincode)
        deployChaincode
        ;;
    down)
        stopNetwork
        ;;
    cleanup)
        cleanupAll
        ;;
    full)
        generateCrypto
        startNetwork
        sleep 2
        createChannel
        sleep 2
        deployChaincode
        infoln "=== MediVault Fabric network is ready ==="
        ;;
    *)
        echo ""
        echo "MediVault Fabric Network Control"
        echo "================================"
        echo ""
        echo "  $0 generate        Generate crypto material (cryptogen)"
        echo "  $0 up              Start Docker containers"
        echo "  $0 createChannel   Create channel and join all peers"
        echo "  $0 deployChaincode Package, install, approve, commit chaincode"
        echo "  $0 down            Stop and remove containers"
        echo "  $0 cleanup         Remove all generated files"
        echo "  $0 full            Run everything (generate+up+channel+chaincode)"
        echo ""
        echo "  Prerequisites: Docker Desktop must be running."
        echo ""
        ;;
esac