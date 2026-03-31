// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MedicalVault {
    struct Record {
        string ipfsCid;
        string fileName;
        uint256 timestamp;
        address owner;
    }

    mapping(address => Record[]) private patientRecords;
    mapping(address => mapping(address => bool)) public authorizedDoctors;

    function addRecord(string memory _cid, string memory _name) public {
        patientRecords[msg.sender].push(Record(_cid, _name, block.timestamp, msg.sender));
    }

    function setDoctorAccess(address _doctor, bool _status) public {
        authorizedDoctors[msg.sender][_doctor] = _status;
    }

    function getRecords(address _patient) public view returns (Record[] memory) {
        require(msg.sender == _patient || authorizedDoctors[_patient][msg.sender], "Not authorized");
        return patientRecords[_patient];
    }
}