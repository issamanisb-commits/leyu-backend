import { AnnotationType } from './entities/AnnotationType.entity';
import {
  Country,
  Dialect,
  Language,
  Region,
  RejectionType,
  Zone,
} from './entities';
import { DataSetAnnotation } from './entities/DataSetAnnotation.entity';
import { Organization } from './entities/Organization.entity';
import { Sector } from './entities/Sector.entity';
import { FlagType } from './entities/FlagType.entity';
import { ApiProperty } from '@nestjs/swagger';

export const AnnotationTypeSanitizedFields = {
  id: true,
  name: true,
  created_date: true,
};
export class AnnotationTypeSanitized {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  created_date: Date;
  static from(annotationType: AnnotationType, preferredLanguage?: string) {
    return {
      id: annotationType.id,
      name:
        preferredLanguage && annotationType.alternative_names
          ? (annotationType.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? annotationType.name)
          : annotationType.name,
      description: annotationType.description,
      created_date: annotationType.created_date,
    };
  }
}
export const CountrySanitizedFields = {
  id: true,
  name: true,
  code: true,
  continent: true,
  created_date: true,
};
export class CountrySanitized {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  code: string;
  @ApiProperty()
  continent: string;
  @ApiProperty()
  created_date: Date;
  static from(country: Country, preferredLanguage?: string) {
    return {
      id: country.id,
      name:
        preferredLanguage && country.alternative_names
          ? (country.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? country.name)
          : country.name,
      code: country.code,
      continent: country.continent,
      created_date: country.created_date,
    };
  }
}

export const DataSetAnnotationSanitizedFields = {
  id: true,
  name: true,
  created_date: true,
};
export class DataSetAnnotationSanitized {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;

  @ApiProperty()
  alternative_names: {
    key: string;
    name: string;
  }[];
  @ApiProperty()
  description: string;
  @ApiProperty()
  created_date: Date;
  static from(
    dataSetAnnotation: DataSetAnnotation,
    preferredLanguage?: string,
  ) {
    return {
      id: dataSetAnnotation.id,
      name:
        preferredLanguage && dataSetAnnotation.alternative_names
          ? (dataSetAnnotation.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? dataSetAnnotation.name)
          : dataSetAnnotation.name,
      alternative_names: dataSetAnnotation.alternative_names,
      description: dataSetAnnotation.description,
      created_date: dataSetAnnotation.created_date,
    };
  }
}
export class LanguageSanitized {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  alternative_names: {
    key: string;
    name: string;
  }[];
  @ApiProperty()
  code: string;

  @ApiProperty()
  created_date: Date;
  static from(language: Language, preferredLanguage?: string) {
    return {
      id: language.id,
      name:
        preferredLanguage && language.alternative_names
          ? (language.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? language.name)
          : language.name,
      alternative_names: language.alternative_names,
      code: language.code,
      created_date: language.created_date,
    };
  }
}
export const DialectSanitizedFields = {
  id: true,
  name: true,
  created_date: true,
};

export class DialectSanitized {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;

  @ApiProperty()
  alternative_names: {
    key: string;
    name: string;
  }[];
  @ApiProperty()
  created_date: Date;

  @ApiProperty({ type: LanguageSanitized })
  language?: LanguageSanitized;
  static from(dialect: Dialect, preferredLanguage?: string) {
    return {
      id: dialect.id,
      name:
        preferredLanguage && dialect.alternative_names
          ? dialect.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name || dialect.name
          : dialect.name,
      alternative_names: dialect.alternative_names,
      created_date: dialect.created_date,
      language: dialect.language && LanguageSanitized.from(dialect.language),
    };
  }
}
export const FlagTypeSanitizedFields = {
  id: true,
  name: true,
  created_date: true,
};
export class FlagTypeSanitized {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  alternative_names: {
    key: string;
    name: string;
  }[];
  @ApiProperty()
  description: string;
  @ApiProperty()
  created_date: Date;
  static from(flagType: FlagType, preferredLanguage?: string) {
    return {
      id: flagType.id,
      name:
        preferredLanguage && flagType.alternative_names
          ? (flagType.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? flagType.name)
          : flagType.name,
      alternative_names: flagType.alternative_names,

      description: flagType.description,
      created_date: flagType.created_date,
    };
  }
}
export const LanguageSanitizedFields = {
  id: true,
  name: true,
  code: true,
  created_date: true,
};

export const OrganizationSanitizedFields = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  created_date: true,
};
export class OrganizationSanitized {
  @ApiProperty()
  id: number;
  @ApiProperty()
  name: string;
  @ApiProperty()
  alternative_names: {
    key: string;
    name: string;
  }[];
  @ApiProperty()
  email: string;
  @ApiProperty()
  phone: string;
  @ApiProperty()
  address: string;
  @ApiProperty()
  created_date: Date;
  static from(organization: Organization, preferredLanguage?: string) {
    return {
      id: organization.id,
      name:
        preferredLanguage && organization.alternative_names
          ? (organization.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? organization.name)
          : organization.name,
      alternative_names: organization.alternative_names,
      email: organization.email,
      phone: organization.phone,
      address: organization.address,
      created_date: organization.created_date,
    };
  }
}
export const RegionSanitizedFields = {
  id: true,
  name: true,
  created_date: true,
};
export class RegionSanitized {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  alternative_names: {
    key: string;
    name: string;
  }[];
  @ApiProperty()
  created_date: Date;
  @ApiProperty({ type: CountrySanitized })
  country?: CountrySanitized;
  static from(region: Region, preferredLanguage?: string) {
    return {
      id: region.id,
      name:
        preferredLanguage && region.alternative_names
          ? (region.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? region.name)
          : region.name,
      alternative_names: region.alternative_names,
      created_date: region.created_date,
      country: region.country && CountrySanitized.from(region.country),
    };
  }
}
export const RejectionTypeSanitizedFields = {
  id: true,
  name: true,
  created_date: true,
};
export class RejectionTypeSanitized {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  created_date: Date;
  static from(rejectionType: RejectionType, preferredLanguage?: string) {
    return {
      id: rejectionType.id,
      name:
        preferredLanguage && rejectionType.alternative_names
          ? (rejectionType.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? rejectionType.name)
          : rejectionType.name,
      description: rejectionType.description,
      created_date: rejectionType.created_date,
    };
  }
}
export const SectorSanitizedFields = {
  id: true,
  name: true,
  created_date: true,
};
export class SectorSanitized {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  alternative_names: {
    key: string;
    name: string;
  }[];
  @ApiProperty()
  created_date: Date;
  static from(sector: Sector, preferredLanguage?: string) {
    return {
      id: sector.id,
      name:
        preferredLanguage && sector.alternative_names
          ? (sector.alternative_names.find(
              (alt) => alt.key === preferredLanguage,
            )?.name ?? sector.name)
          : sector.name,
      alternative_names: sector.alternative_names,
      created_date: sector.created_date,
    };
  }
}

export const ZoneSanitizedFields = {
  id: true,
  name: true,
  created_date: true,
};
export class ZoneSanitized {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  alternative_names: {
    key: string;
    name: string;
  }[];
  @ApiProperty()
  created_date: Date;
  static from(zone: Zone, preferredLanguage?: string) {
    return {
      id: zone.id,
      name:
        preferredLanguage && zone.alternative_names
          ? (zone.alternative_names.find((alt) => alt.key === preferredLanguage)
              ?.name ?? zone.name)
          : zone.name,
      alternative_names: zone.alternative_names,
      created_date: zone.created_date,
    };
  }
}
