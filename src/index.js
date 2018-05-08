
/**
 * Module dependencies.
 */

import { positions } from './constants';

/**
 * Export UkModulusChecking.
 */

export default class UkModulusChecking {

  /**
   * Constructor.
   */

  constructor({ accountNumber = '', sortCode = '' }) {
    this.accountNumber = this.sanitize(accountNumber);
    this.sortCode = this.sanitize(sortCode);
    this.sortCodeSubstitutes = this.loadScsubtab();
    this.weightTable = this.loadValacdos();
  }

  /**
   * Get check weight.
   */

  getCheckWeight(check, number) {
    if (check.exception === 2) {
      if (this.pickPosition(number, 'a') !== 0 && this.pickPosition(number, 'g') !== 9) {
        return [0, 0, 1, 2, 5, 3, 6, 4, 8, 7, 10, 9, 3, 1];
      }

      if (this.pickPosition(number, 'a') !== 0 && this.pickPosition(number, 'g') === 9) {
        return [0, 0, 0, 0, 0, 0, 0, 0, 8, 7, 10, 9, 3, 1];
      }
    }

    if (check.exception === 7) {
      if (this.pickPosition(number, 'g') === 9) {
        return [0, 0, 0, 0, 0, 0, 0, 0, check.c, check.d, check.e, check.f, check.g, check.h];
      }
    }

    if (check.exception === 10) {
      const ab = number.charAt(positions.a) + number.charAt(positions.b);

      if (ab === '09' || ab === '99' && this.pickPosition(number, 'b') === 9) {
        return [0, 0, 0, 0, 0, 0, 0, 0, check.c, check.d, check.e, check.f, check.g, check.h];
      }
    }

    return [check.u, check.v, check.w, check.x, check.y, check.z, check.a, check.b, check.c, check.d, check.e, check.f, check.g, check.h];
  }

  /**
   * Get number to be used in validation process. (sorting code + account number).
   */

  getNumber(check, number) {
    let sortCode = this.sortCode;

    number = number || this.accountNumber;

    if (check.exception === 5) {
      sortCode = this.getSubstitute(sortCode) || sortCode;
    } else if (check.exception === 8) {
      sortCode = '090126';
    } else if (check.exception === 9) {
      sortCode = '309634';
    }

    return `${sortCode}${number}`;
  }

  /**
   * Get sorting code checks.
   */

  getSortCodeChecks() {
    const checks = [];
    const sortCode = parseInt(this.sortCode, 10);

    for (const check of this.weightTable) {
      // All checks containing the sort code in the `weight range` can/must be performed.
      if (sortCode >= check.start && sortCode <= check.end) {
        checks.push(check);
      }

      // There may be one or two entries in the table for the sorting code,
      // depending on whether one or two modulus checks must be carried out.
      if (checks.length === 2) {
        return checks;
      }
    }

    return checks;
  }

  /**
   * Sorting code substitution.
   */

  getSubstitute(sortCode) {
    for (const substitute of this.sortCodeSubstitutes) {
      if (substitute.original === parseInt(sortCode, 10)) {
        return parseInt(substitute.substitute, 10);
      }
    }

    return parseInt(sortCode, 10);
  }

  /**
   * Is check skippable.
   */

  isCheckSkippable(check, number) {
    if (check.exception === 3 && (this.pickPosition(number, 'c') === 6 || this.pickPosition(number, 'c') === 9)) {
      return true;
    }

    if (check.exception === 6 && this.pickPosition(number, 'a') >= 4 && this.pickPosition(number, 'a') <= 8 && this.pickPosition(number, 'g') === this.pickPosition(number, 'h')) {
      return true;
    }

    return false;
  }

  /**
   * Is check valid.
   */

  isCheckValid(check, number) {
    number = this.getNumber(check, number);

    if (this.isCheckSkippable(check, number)) {
      return true;
    }

    const module = check.mod === 'MOD11' ? 11 : 10;
    const weight = this.getCheckWeight(check, number);

    // Multiply each number in the sorting code and account number with the corresponding number in the weight.
    let weightedAccount = [];

    for (let i = 0; i < 14; i++) {
      weightedAccount[i] = parseInt(number.charAt(i), 10) * parseInt(weight[i], 10);
    }

    // Add all the results together.
    if (check.mod === 'DBLAL') {
      weightedAccount = weightedAccount.join('').split('');
    }

    let total = weightedAccount.reduce((previous, current) => parseInt(previous, 10) + parseInt(current, 10));

    // This effectively places a financial institution number (580149) before the sorting code and account
    // number which is subject to the alternate doubling as well.
    if (check.exception === 1) {
      total += 27;
    }

    // Calculate remainder.
    const remainder = total % module;

    // Exception handling.
    if (check.exception === 4) {
      return remainder === this.pickPosition(number, 'g') + this.pickPosition(number, 'h');
    }

    if (check.exception === 5) {
      if (check.mod === 'DBLAL') {
        if (remainder === 0 && this.pickPosition(number, 'h') === 0) {
          return true;
        }

        return this.pickPosition(number, 'h') === 10 - remainder;
      }

      if (remainder === 1) {
        return false;
      }

      if (remainder === 0 && this.pickPosition(number, 'g') === 0) {
        return true;
      }

      return this.pickPosition(number, 'g') === 11 - remainder;
    }

    return remainder === 0;
  }

  /**
   * Is valid.
   */

   isValid() {
     if (this.accountNumber.length < 6 || this.accountNumber.length > 10 || this.sortCode.length !== 6) {
       return false;
     }

     const checks = this.getSortCodeChecks();

     // If no range is found that contains the sorting code, there is no modulus check that can be performed.
     // The sorting code and account number should be presumed valid unless other evidence implies otherwise.
     if (checks.length === 0) {
       return true;
     }

     const firstCheck = checks[0];

     if (this.isCheckValid(firstCheck)) {
       if (checks.length === 1 || [2, 9, 10, 11, 12, 13, 14].indexOf(firstCheck.exception) !== -1) {
         return true;
       }

       // Verify second check.
       return this.isCheckValid(checks[1]);
     }

     if (firstCheck.exception === 14) {
       if ([0, 1, 9].indexOf(parseInt(this.accountNumber.charAt(7), 10)) === -1) {
         return false;
       }

       //  If the 8th digit is 0, 1 or 9, then remove the digit from the account number and insert a 0 as the 1st digit for check purposes only
       return this.isCheckValid(checks[0], `0${this.accountNumber.substring(7, 0)}`);
     }

     if (checks.length === 1 || [2, 9, 10, 11, 12, 13, 14].indexOf(firstCheck.exception) === -1) {
       return false;
     }

     // Verify second check.
     return this.isCheckValid(checks[1]);
   }

  /**
   * Load scsubtab file.
   */

  loadScsubtab() {
    const content = `938173 938017
938289 938068
938297 938076
938600 938611
938602 938343
938604 938603
938608 938408
938609 938424
938613 938017
938616 938068
938618 938657
938620 938343
938622 938130
938628 938181
938643 938246
938647 938611
938648 938246
938649 938394
938651 938335
938653 938424
938654 938621`;

    const scsubtab = [];

    content.split('\n').forEach((line) => {
      const data = line.split(/\s+/);

      scsubtab.push({
        original: parseInt(data[0], 10),
        substitute: parseInt(data[1], 10)
      });
    });

    return scsubtab;
  }

  /**
   * Load valacdos file.
   */

  loadValacdos() {
    const content = `010004 016715 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
040004 040004 DBLAL    0    0    0    0    0    0    8    7    6    5    4    3    2    1
040010 040014 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
040010 040014 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
040020 040059 MOD11    0    2    0    0    9    1    2    8    4    3    7    5    6    1
040072 040073 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
040082 040082 MOD10    2    1    2    1    2    1    0   64   32   16    8    4    2    1
040400 041399 DBLAL    1    3    4    3    9    3    1    7    5    5    4    5    2    4
050000 050020 MOD11    0    0    0    0    0    0    2    1    7    5    8    2    4    1
050022 058999 MOD11    0    0    0    0    0    0    2    1    7    5    8    2    4    1
070116 070116 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1  12
070116 070116 MOD10    0    3    2    4    5    8    9    4    5    6    7    8    9   -1  13
070246 070246 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1
070436 070436 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1
070806 070806 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1
070976 070976 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1
071096 071096 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1
071226 071226 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1
071306 071306 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1
071986 071986 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1
074456 074456 MOD11    0    0    7    6    5    8    9    4    5    6    7    8    9   -1  12
074456 074456 MOD10    0    3    2    4    5    8    9    4    5    6    7    8    9   -1  13
080211 080211 MOD10    0    0    0    0    0    0    7    1    3    7    1    3    7    1
080228 080228 MOD10    0    0    0    0    0    0    7    1    3    7    1    3    7    1
086001 086001 MOD10    0    0    0    0    0    0    7    1    3    7    1    3    7    1
086020 086020 MOD10    0    0    0    0    0    0    7    1    3    7    1    3    7    1
086086 086086 MOD11    0    0    0    0    0    8    9    4    5    6    7    8    9   -1
086090 086090 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1   8
089000 089999 MOD10    0    0    0    0    0    0    7    1    3    7    1    3    7    1
090013 090013 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090105 090105 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090118 090118 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
090126 090129 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090131 090136 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
090150 090156 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
090180 090185 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090190 090196 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090204 090204 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090222 090222 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090356 090356 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
090500 090599 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090704 090704 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090705 090705 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090710 090710 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090715 090715 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090720 090726 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
090736 090739 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
090790 090790 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
091600 091600 MOD10    0    0    0    0    0    1    7    1    3    7    1    3    7    1
091601 091601 MOD10    0    0    3    7    1    3    7    1    3    7    1    3    7    1
091740 091743 MOD10    0    0    0    0    0    1    7    1    3    7    1    3    7    1
091800 091809 MOD10    0    0    0    0    0    1    7    1    3    7    1    3    7    1
091811 091865 MOD10    0    0    0    0    0    1    7    1    3    7    1    3    7    1
100000 101099 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
101101 101498 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
101500 101999 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
102400 107999 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
108000 108079 MOD11    0    0    0    0    0    3    2    7    6    5    4    3    2    1
108080 108099 MOD11    0    0    0    0    4    3    2    7    6    5    4    3    2    1
108100 109999 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
110000 119280 DBLAL    0    0    2    1    2    1    2    1    2    1    2    1    2    1   1
119282 119283 DBLAL    0    0    2    1    2    1    2    1    2    1    2    1    2    1   1
119285 119999 DBLAL    0    0    2    1    2    1    2    1    2    1    2    1    2    1   1
120000 120961 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
120963 122009 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
122011 122101 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
122103 122129 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
122131 122135 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
122213 122299 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
122400 122999 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
124000 124999 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
133000 133999 MOD11    0    0    0    0    0   10    7    8    4    6    3    5    2    1
134012 134020 MOD11    0    0    0    7    5    9    8    4    6    3    5    2    0    0   4
134121 134121 MOD11    0    0    0    1    0    0    8    4    6    3    5    2    0    0   4
150000 158000 MOD11    4    3    0    0    0    0    2    7    6    5    4    3    2    1
159800 159800 MOD11    0    0    0    0    0    0    7    6    5    4    3    2    1    0
159900 159900 MOD11    0    0    0    0    0    0    7    6    5    4    3    2    1    0
159910 159910 MOD11    0    0    0    0    0    0    7    6    5    4    3    2    1    0
160000 161027 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161029 161029 MOD11    0    0    0    0    0    0    2    7    6    5    4    3    2    1
161030 161041 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161050 161050 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161055 161055 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161060 161060 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161065 161065 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161070 161070 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161075 161075 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161080 161080 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161085 161085 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161090 161090 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
161100 162028 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
162030 164300 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
165901 166001 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
166050 167600 MOD11    0    0    6    5    4    3    2    7    6    5    4    3    2    1
168600 168600 MOD11    0    0    0    0    0    0    2    7    6    5    4    3    2    1
170000 179499 MOD11    0    0    4    2    7    9    2    7    6    5    4    3    2    1
180002 180002 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
180005 180005 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
180009 180009 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
180036 180036 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
180038 180038 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
180091 180092 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
180104 180104 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
180109 180110 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
180156 180156 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
185001 185001 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1  14
185003 185025 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
185027 185099 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
200000 200002 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200000 200002 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200004 200004 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200004 200004 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200026 200026 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200026 200026 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200051 200077 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200051 200077 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200079 200097 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200079 200097 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200099 200156 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200099 200156 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200158 200387 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200158 200387 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200403 200405 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200403 200405 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200407 200407 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200407 200407 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200411 200412 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200411 200412 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200414 200423 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200414 200423 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200425 200899 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200425 200899 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
200901 201159 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
200901 201159 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
201161 201177 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
201161 201177 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
201179 201351 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
201179 201351 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
201353 202698 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
201353 202698 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
202700 203239 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
202700 203239 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
203241 203255 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
203241 203255 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
203259 203519 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
203259 203519 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
203521 204476 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
203521 204476 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
204478 205475 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
204478 205475 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
205477 205954 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
205477 205954 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
205956 206124 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
205956 206124 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
206126 206157 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
206126 206157 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
206159 206390 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
206159 206390 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
206392 206799 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
206392 206799 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
206802 206874 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
206802 206874 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
206876 207170 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
206876 207170 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
207173 208092 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
207173 208092 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
208094 208721 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
208094 208721 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
208723 209034 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
208723 209034 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
209036 209128 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
209036 209128 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
209130 209999 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1   6
209130 209999 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   6
230088 230088 MOD10    2    1    2    1    2    1    2    7    4    5    6    3    8    1
230338 230338 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
230338 230338 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
230580 230580 MOD11    0    0    0    0    0    0    2    7    6    5    4    3    2    1  12
230580 230580 MOD11    0    0    0    0    0    0    5    7    6    5    4    3    2    1  13
230614 230614 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
230614 230614 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
230709 230709 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
230709 230709 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
230872 230872 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
230872 230872 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
230933 230933 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
230933 230933 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231018 231018 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231018 231018 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231213 231213 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231213 231213 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231228 231228 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231228 231228 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231354 231354 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231354 231354 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231469 231469 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231469 231469 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231558 231558 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231558 231558 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231618 231618 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231618 231618 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231679 231679 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231679 231679 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231843 231843 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231843 231843 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
231985 231985 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
231985 231985 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232130 232130 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232130 232130 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232279 232279 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232279 232279 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232283 232283 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232283 232283 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232290 232290 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232445 232445 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232445 232445 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232571 232571 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232571 232571 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232636 232636 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232636 232636 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232704 232704 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232704 232704 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232725 232725 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232725 232725 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232813 232813 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232813 232813 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
232939 232939 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
232939 232939 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233080 233080 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233080 233080 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233135 233135 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233135 233135 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233142 233142 MOD10    2    1    2    1    2    1   30   36   24   20   16   12    8    4
233171 233171 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233171 233171 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233188 233188 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233188 233188 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233231 233231 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233231 233231 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233344 233344 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233344 233344 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233438 233438 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233438 233438 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233456 233456 MOD10    2    1    2    1    2    1    0   64   32   16    8    4    2    1
233483 233483 MOD11    0    0    0    0    0    0    2    7    6    5    4    3    2    1
233556 233556 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233556 233556 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233658 233658 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233658 233658 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233693 233693 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233693 233693 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
233752 233752 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
233752 233752 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234081 234081 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234081 234081 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234193 234193 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234193 234193 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234252 234252 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234252 234252 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234321 234321 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234321 234321 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234377 234377 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234377 234377 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234570 234570 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234570 234570 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234666 234666 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234666 234666 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234779 234779 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234779 234779 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234828 234828 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234828 234828 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
234985 234985 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
234985 234985 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235054 235054 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235054 235054 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235164 235164 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235164 235164 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235262 235262 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235262 235262 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235323 235323 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235323 235323 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235451 235451 MOD11    0    0    0    0    0    0    2    7    6    5    4    3    2    1
235459 235459 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235459 235459 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235519 235519 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235519 235519 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235676 235676 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235676 235676 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235711 235711 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235711 235711 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235756 235756 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235756 235756 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
235945 235945 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
235945 235945 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236006 236006 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236006 236006 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236119 236119 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236119 236119 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236233 236233 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236233 236233 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236247 236247 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
236293 236293 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236293 236293 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236422 236422 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236422 236422 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236527 236527 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236527 236527 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236538 236538 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236538 236538 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236643 236643 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236643 236643 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236761 236761 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236761 236761 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236907 236907 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
236907 236907 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
236972 236972 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237130 237130 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237130 237130 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237265 237265 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237265 237265 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237355 237355 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237355 237355 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237423 237423 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237423 237423 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237427 237427 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237427 237427 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237563 237563 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237563 237563 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237622 237622 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237622 237622 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237728 237728 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237728 237728 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
237873 237873 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
237873 237873 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238020 238020 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238020 238020 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238043 238043 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238043 238043 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238051 238051 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238051 238051 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238175 238175 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238175 238175 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238257 238257 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238257 238257 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238392 238431 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
238392 238431 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238432 238432 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238432 238432 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238433 238583 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
238433 238583 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238585 238590 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
238585 238590 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238599 238599 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238599 238599 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238613 238613 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238613 238613 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238672 238672 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238672 238672 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238717 238717 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238717 238717 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
238890 238899 MOD11    0    0    0    0    4    3    2    7    6    5    4    3    2    1
238908 238908 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
238908 238908 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239071 239071 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239071 239071 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239126 239126 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239126 239126 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239136 239140 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
239136 239140 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239143 239144 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
239143 239144 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239282 239283 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
239282 239283 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239285 239294 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
239285 239294 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239295 239295 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239295 239295 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239296 239318 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
239296 239318 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239360 239360 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239360 239360 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239380 239380 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239380 239380 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239435 239435 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239435 239435 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239525 239525 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239525 239525 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239642 239642 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239642 239642 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
239751 239751 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
239751 239751 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
300000 300006 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
300000 300006 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
300008 300009 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
300008 300009 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
300050 300051 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
300134 300138 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
300134 300138 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
300161 300161 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1
300176 300176 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1
301001 301001 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301001 301001 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301004 301004 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301004 301004 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301007 301007 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301007 301007 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301012 301012 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301012 301012 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301022 301022 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301027 301027 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301047 301047 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301047 301047 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301049 301049 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301049 301049 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301052 301052 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301052 301052 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301075 301076 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301075 301076 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301108 301108 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301108 301108 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301112 301112 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301112 301112 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301127 301127 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301127 301127 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301137 301137 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301142 301142 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301148 301148 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301148 301148 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301154 301155 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301161 301161 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301161 301161 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301166 301166 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301170 301170 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301174 301175 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301174 301175 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301191 301191 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301191 301191 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301194 301195 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301194 301195 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301204 301205 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301204 301205 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301209 301210 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301209 301210 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301215 301215 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301215 301215 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301218 301218 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301218 301218 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301220 301221 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301220 301221 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301234 301234 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301234 301234 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301251 301251 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301251 301251 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301259 301259 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301259 301259 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301274 301274 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301274 301274 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301280 301280 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301280 301280 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301286 301286 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301286 301286 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301295 301296 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301295 301296 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301299 301299 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301299 301299 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301301 301301 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301301 301301 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301305 301305 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301305 301305 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301318 301318 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301318 301318 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301330 301330 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301330 301330 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301332 301332 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301332 301332 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301335 301335 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301335 301335 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301342 301342 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301342 301342 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301350 301355 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301350 301355 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301364 301364 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301364 301364 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301368 301368 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301368 301368 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301376 301376 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301376 301376 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301380 301380 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301380 301380 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301388 301388 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301388 301388 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301390 301390 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301390 301390 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301395 301395 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301395 301395 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301400 301400 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301400 301400 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301424 301424 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301424 301424 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301432 301432 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301432 301432 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301433 301433 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301435 301435 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301437 301437 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301437 301437 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301439 301439 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301440 301440 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301440 301440 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301443 301443 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301444 301444 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301444 301444 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301447 301447 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301447 301447 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301451 301451 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301451 301451 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301456 301456 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301456 301456 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301458 301458 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301460 301460 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301460 301460 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301463 301463 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301464 301464 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301464 301464 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301466 301466 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301469 301469 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301469 301469 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301471 301471 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301471 301471 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301474 301474 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301477 301477 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301477 301477 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301482 301482 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301483 301483 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301483 301483 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301485 301485 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301487 301487 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301504 301504 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301504 301504 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301510 301510 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301514 301514 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301517 301517 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301525 301525 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301539 301539 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301539 301539 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301542 301542 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301542 301542 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301552 301553 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301552 301553 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301557 301557 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301557 301557 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301573 301573 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301593 301593 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301593 301593 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301595 301595 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301595 301595 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301597 301597 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301597 301597 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301599 301599 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301599 301599 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301607 301607 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301609 301609 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301609 301609 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301611 301611 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301611 301611 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301620 301620 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301620 301620 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301628 301628 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301628 301628 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301634 301634 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301634 301634 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301641 301642 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301641 301642 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301653 301653 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301653 301653 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301657 301657 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301662 301662 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301662 301662 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301664 301664 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301664 301664 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301670 301670 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301670 301670 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301674 301674 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301674 301674 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301684 301684 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301684 301684 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301695 301696 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301695 301696 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301700 301702 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301700 301702 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301705 301705 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
301712 301712 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301712 301712 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301716 301716 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301716 301716 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301748 301748 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301748 301748 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301773 301773 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301773 301773 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301777 301777 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301777 301777 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301780 301780 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301780 301780 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301785 301785 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301785 301785 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301803 301803 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301803 301803 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301805 301805 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301805 301805 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301806 301806 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301806 301806 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301816 301816 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301816 301816 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301825 301825 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301825 301825 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301830 301830 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301830 301830 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301834 301834 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301834 301834 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301843 301843 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301843 301843 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301845 301845 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301845 301845 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301855 301856 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301855 301856 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301864 301864 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301864 301864 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301868 301869 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301868 301869 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301883 301883 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301883 301883 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301886 301888 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301886 301888 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301898 301898 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301898 301898 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
301914 301996 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
301914 301996 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
302500 302500 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
302500 302500 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
302556 302556 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
302556 302556 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
302579 302580 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
302579 302580 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
302880 302880 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
303460 303461 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
303460 303461 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
305907 305939 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
305907 305939 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
305941 305960 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
305941 305960 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
305971 305971 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
305971 305971 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
305974 305974 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
305974 305974 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
305978 305978 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
305978 305978 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
305982 305982 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
305982 305982 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
305984 305988 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
305984 305988 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
305990 305993 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
305990 305993 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306017 306018 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306017 306018 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306020 306020 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306020 306020 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306028 306028 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306028 306028 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306038 306038 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306038 306038 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306150 306151 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306150 306151 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306154 306155 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306154 306155 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306228 306228 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306228 306228 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306229 306229 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306229 306229 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306232 306232 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306232 306232 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306242 306242 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306242 306242 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306245 306245 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306245 306245 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306249 306249 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306249 306249 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306255 306255 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306255 306255 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306259 306263 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306259 306263 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306272 306279 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306272 306279 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306281 306281 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306281 306281 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306289 306289 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306289 306289 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306296 306296 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306296 306296 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306299 306299 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306299 306299 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306300 306300 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306300 306300 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306347 306347 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306347 306347 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306354 306355 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306354 306355 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306357 306357 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306357 306357 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306359 306359 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306359 306359 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306364 306364 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306364 306364 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306394 306394 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306394 306394 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306397 306397 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306397 306397 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306410 306410 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306410 306410 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306412 306412 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306412 306412 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306414 306415 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306414 306415 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306418 306419 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306418 306419 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306422 306422 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306422 306422 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306434 306434 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306434 306434 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306437 306438 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306437 306438 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306442 306444 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306442 306444 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306457 306457 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306457 306457 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306472 306472 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306472 306472 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306479 306479 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306479 306479 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306497 306497 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306497 306497 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306521 306522 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306521 306522 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306537 306539 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306537 306539 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306541 306541 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306541 306541 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306549 306549 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306549 306549 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306562 306565 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306562 306565 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306572 306572 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306572 306572 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306585 306586 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306585 306586 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306592 306593 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306592 306593 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306675 306677 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306675 306677 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306689 306689 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306689 306689 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306695 306696 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306695 306696 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306733 306735 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306733 306735 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306747 306749 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306747 306749 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306753 306753 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306753 306753 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306756 306756 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306756 306756 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306759 306759 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306759 306759 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306762 306762 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306762 306762 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306764 306764 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306764 306764 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306766 306767 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306766 306767 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306769 306769 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306769 306769 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306772 306772 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306772 306772 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306775 306776 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306775 306776 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306779 306779 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306779 306779 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306782 306782 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306782 306782 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306788 306789 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306788 306789 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
306799 306799 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
306799 306799 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307184 307184 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307184 307184 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307188 307190 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307188 307190 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307198 307198 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307198 307198 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307271 307271 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307271 307271 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307274 307274 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307274 307274 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307654 307654 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307654 307654 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307779 307779 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307779 307779 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307788 307789 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307788 307789 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
307809 307809 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
307809 307809 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308012 308012 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308012 308012 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308016 308016 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308016 308016 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308026 308027 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308026 308027 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308033 308034 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308033 308034 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308037 308037 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308037 308037 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308042 308042 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308042 308042 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308045 308045 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308045 308045 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308048 308049 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308048 308049 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308054 308055 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308054 308055 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308063 308063 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308063 308063 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308076 308077 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308076 308077 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308082 308083 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308082 308083 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308085 308085 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308085 308085 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308087 308089 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308087 308089 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308095 308097 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308095 308097 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308404 308404 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308404 308404 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308412 308412 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308412 308412 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308420 308427 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308420 308427 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308433 308434 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308433 308434 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308441 308446 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308441 308446 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308448 308448 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308448 308448 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308451 308454 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308451 308454 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308457 308459 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308457 308459 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308462 308463 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308462 308463 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308467 308469 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308467 308469 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308472 308473 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308472 308473 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308475 308477 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308475 308477 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308479 308479 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308479 308479 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308482 308482 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308482 308482 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308484 308487 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308484 308487 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308784 308784 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308784 308784 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308804 308804 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308804 308804 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308822 308822 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308822 308822 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
308952 308952 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
308952 308952 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
309001 309633 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
309001 309633 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
309634 309634 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1
309635 309746 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
309635 309746 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
309748 309871 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
309748 309871 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
309873 309915 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
309873 309915 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
309917 309999 MOD11    0    0    3    2    9    8    5    7    6    5    4    3    2    1   2
309917 309999 MOD11    0    0    3    2    9    8    1    7    6    5    4    3    2    1   9
400000 400193 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
400000 400193 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
400196 400514 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
400196 400514 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
400515 400515 MOD11    0    0    0    0    0    0    8    5    7    3    4    9    2    1
400516 401054 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
400516 401054 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
401055 401055 MOD11    0    0    0    0    0    0    8    5    7    3    4    9    2    1
401056 401198 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
401056 401198 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
401199 401199 MOD11    0    0    0    0    0    0    8    5    7    3    4    9    2    1
401200 401265 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
401200 401265 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
401266 401266 MOD11    0    0    0    0    0    0    8    5    7    3    4    9    2    1
401267 401275 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
401267 401275 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
401276 401279 MOD11    0    0    0    0    0    0    8    5    7    3    4    9    2    1
401280 401899 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
401280 401899 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
401900 401900 MOD11    0    0    0    0    0    0    8    5    7    3    4    9    2    1
401901 401949 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
401901 401949 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
401950 401950 MOD11    0    0    0    0    0    0    8    5    7    3    4    9    2    1
401951 404374 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
401951 404374 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
404375 404384 MOD11    0    0    0    0    0    0    8    5    7    3    4    9    2    1
404385 404799 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
404385 404799 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
406420 406420 MOD10    0    0    0    0    0    0    8    7    6    5    4    3    2    1
500000 501029 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
502101 560070 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600000 600108 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600110 600124 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600127 600142 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600144 600149 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600180 600304 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600307 600312 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600314 600355 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600357 600851 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
600901 601360 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
601403 608028 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
608301 608301 MOD10    0    0    0    0    0    0    7    1    3    7    1    3    7    1
608316 608316 MOD10    0    0    0    0    0    0    8    7    6    5    4    3    2    1
608370 608370 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
608371 608371 MOD11    0    0    0    0    0    0    2    8    4    3    7    5    6    1
609593 609593 MOD10    0    0    0    0    0    0    7    1    3    7    1    3    7    1
609599 609599 MOD10    0    0    0    0    0    0    0    5    7    5    2    1    2    1
640001 640001 MOD11    0    0    0    0    0    0    8    7    6    5    4    3    2    1
720000 720249 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
720251 724443 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
725000 725251 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
725253 725616 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
726000 726616 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
770100 771799 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
771877 771877 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
771900 772799 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
772813 772817 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
772901 773999 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
774100 774599 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
774700 774830 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
774832 777789 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
777791 777999 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
778001 778001 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
778300 778799 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
778855 778855 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
778900 779174 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
779414 779999 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1   7
800000 802005 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
802007 802042 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
802044 802065 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
802067 802109 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
802111 802114 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
802116 802123 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
802151 802154 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
802156 802179 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
802181 803599 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
803609 819999 MOD11    0    0    1    8    2    6    3    7    9    5    8    4    2    1
820000 826917 MOD11    0    0    0    0    0    0    0    0    7    3    4    9    2    1
820000 826917 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   3
826919 827999 MOD11    0    0    0    0    0    0    0    0    7    3    4    9    2    1
826919 827999 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   3
829000 829999 MOD11    0    0    0    0    0    0    0    0    7    3    4    9    2    1
829000 829999 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1   3
830000 835700 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836500 836501 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836505 836506 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836510 836510 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836515 836515 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836530 836530 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836535 836535 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836540 836540 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836560 836560 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836565 836565 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836570 836570 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836585 836585 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836590 836590 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836595 836595 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836620 836620 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836625 836625 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
836630 836630 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
837550 837550 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
837560 837560 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
837570 837570 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
837580 837580 MOD11    0    0    4    3    2    7    2    7    6    5    4    3    2    1
839105 839106 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
839105 839106 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
839130 839131 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    1    0
839130 839131 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
839147 839147 MOD10    0    0    0    0    0    0    0    5    7    5    2    1    2    1
870000 872791 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
870000 872791 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
872793 876899 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
872793 876899 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
876919 876919 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
876919 876919 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
876921 876923 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
876921 876923 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
876925 876932 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
876925 876932 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
876935 876935 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
876935 876935 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
876951 876951 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
876951 876951 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
876953 876955 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
876953 876955 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
876957 876957 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
876957 876957 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
876961 876965 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
876961 876965 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
877000 877070 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
877000 877070 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
877071 877071 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
877071 877071 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
877078 877078 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
877078 877078 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
877088 877088 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
877088 877088 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
877090 877090 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
877090 877090 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
877098 877098 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
877098 877098 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
877099 879999 MOD11    0    0    1    2    5    3    6    4    8    7   10    9    3    1  10
877099 879999 MOD11    0    0    5   10    9    8    0    7    6    5    4    3    2    1  11
890000 890699 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
891000 891616 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
892000 892616 MOD11    0    0    0    0    0    9    8    7    6    5    4    3    2    1
900000 902396 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
900000 902396 MOD11   32   16    8    4    2    1    0    0    0    0    0    0    0    0
902398 909999 MOD11    0    0    0    0    0    0  128   64   32   16    8    4    2    1
902398 909999 MOD11   32   16    8    4    2    1    0    0    0    0    0    0    0    0
938000 938696 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    0    0   5
938000 938696 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    0   5
938698 938999 MOD11    7    6    5    4    3    2    7    6    5    4    3    2    0    0   5
938698 938999 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    0   5
950000 950002 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
950000 950002 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
950004 950479 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
950004 950479 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
950500 959999 MOD11    0    0    0    0    0    0    0    7    6    5    4    3    2    1
950500 959999 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
980000 980004 MOD11    0    0    0    0    0    0    7    6    5    4    3    2    1    0
980000 980004 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
980006 983000 MOD11    0    0    0    0    0    0    7    6    5    4    3    2    1    0
980006 983000 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
983003 987000 MOD11    0    0    0    0    0    0    7    6    5    4    3    2    1    0
983003 987000 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1
987004 989999 MOD11    0    0    0    0    0    0    7    6    5    4    3    2    1    0
987004 989999 DBLAL    2    1    2    1    2    1    2    1    2    1    2    1    2    1`;
    const valacdos = [];

    content.split('\n').forEach((line) => {
      const data = line.split(/\s+/);

      /* jscs:disable validateOrderInObjectKeys */
      valacdos.push({
        start: parseInt(data[0], 10),
        end: parseInt(data[1], 10),
        mod: data[2],
        u: parseInt(data[3], 10),
        v: parseInt(data[4], 10),
        w: parseInt(data[5], 10),
        x: parseInt(data[6], 10),
        y: parseInt(data[7], 10),
        z: parseInt(data[8], 10),
        a: parseInt(data[9], 10),
        b: parseInt(data[10], 10),
        c: parseInt(data[11], 10),
        d: parseInt(data[12], 10),
        e: parseInt(data[13], 10),
        f: parseInt(data[14], 10),
        g: parseInt(data[15], 10),
        h: parseInt(data[16], 10),
        exception: parseInt(data[17], 10) || null
      });
      /* jscs:enable validateOrderInObjectKeys */
    });

    return valacdos;
  }

  /**
   * Pick position in number.
   */

   pickPosition(number, position) {
     return parseInt(number.charAt(positions[position]), 10);
   }

  /**
   * Sanitize.
   */

  sanitize(value) {
    if (typeof value === 'string' || value instanceof String) {
      return value.replace(/-/g, '');
    }

    throw new Error('Invalid value');
  }
}
