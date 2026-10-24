import { Request, Response, NextFunction } from 'express';
import * as communityService from '../services/communityService';

export const getFeed = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(50, Math.max(1, Number(req.query.size) || 10));

    const feed = await communityService.getFeed(page, size, req.user?.sub);
    res.status(200).json({ success: true, data: feed });
  } catch (error) {
    next(error);
  }
};

export const createPost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, tag, imagesUrl, imagesBase64, clubId } = req.body ?? {};

    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ success: false, message: 'title is required' });
      return;
    }

    if (typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ success: false, message: 'description is required' });
      return;
    }

    const post = await communityService.createPost(
      {
        title: title.trim(),
        description: description.trim(),
        tag: typeof tag === 'string' && tag.trim() ? tag.trim() : undefined,
        imagesUrl: Array.isArray(imagesUrl) ? imagesUrl : undefined,
        imagesBase64: Array.isArray(imagesBase64) ? imagesBase64 : undefined,
        clubId: typeof clubId === 'string' && clubId.trim() ? clubId.trim() : undefined,
        pollOptions: Array.isArray(req.body.pollOptions) ? req.body.pollOptions : undefined,
      },
      req.user!
    );

    res.status(201).json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
};

export const likePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await communityService.likePost(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const unlikePost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await communityService.unlikePost(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const addComment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const postId = req.params.id;
    const { text, parentCommentId } = req.body ?? {};

    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ success: false, message: 'text is required' });
      return;
    }

    const result = await communityService.addComment(
      postId,
      text.trim(),
      req.user!.id,
      typeof parentCommentId === 'string' && parentCommentId.trim() ? parentCommentId.trim() : undefined
    );

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getComments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const comments = await communityService.getComments(req.params.id);
    res.status(200).json({ success: true, data: comments });
  } catch (error) {
    next(error);
  }
};

export const getPostById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await communityService.getPostById(req.params.id, req.user?.sub);
    if (!post) {
      res.status(404).json({ success: false, message: 'Post not found' });
      return;
    }
    res.status(200).json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
};

export const createClub = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      clubId,
      description,
      tag,
      locationScope,
      locationText,
      country,
      countryCode,
      regions,
      countries,
      coverImageUrl,
      profileImageUrl,
      profileImageBase64,
      isPrivate,
      theme,
    } = req.body ?? {};

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }

    const validScope = ['single', 'multiple', 'global'].includes(locationScope)
      ? (locationScope as 'single' | 'multiple' | 'global')
      : undefined;

    const club = await communityService.createClub(
      {
        name: name.trim(),
        clubId: typeof clubId === 'string' ? clubId.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : '',
        tag: typeof tag === 'string' ? tag.trim() : undefined,
        locationScope: validScope,
        locationText: typeof locationText === 'string' ? locationText.trim() : undefined,
        country: typeof country === 'string' ? country.trim() : undefined,
        countryCode: typeof countryCode === 'string' ? countryCode.trim() : undefined,
        regions: Array.isArray(regions) ? regions.map((r: any) => String(r).trim()).filter(Boolean) : undefined,
        countries: Array.isArray(countries) ? countries : undefined,
        coverImageUrl: typeof coverImageUrl === 'string' ? coverImageUrl.trim() : undefined,
        profileImageUrl: typeof profileImageUrl === 'string' ? profileImageUrl.trim() : undefined,
        profileImageBase64: typeof profileImageBase64 === 'string' ? profileImageBase64 : undefined,
        isPrivate: typeof isPrivate === 'boolean' ? isPrivate : undefined,
        theme: typeof theme === 'string' ? theme.trim() : undefined,
      },
      req.user!
    );

    res.status(201).json({ success: true, data: club });
  } catch (error) {
    next(error);
  }
};

export const getClubs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clubs = await communityService.getClubs(req.user?.sub);
    res.status(200).json({ success: true, data: clubs });
  } catch (error) {
    next(error);
  }
};

export const getClubById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const club = await communityService.getClubById(req.params.id, req.user?.sub);
    if (!club) {
      res.status(404).json({ success: false, message: 'Club not found' });
      return;
    }
    res.status(200).json({ success: true, data: club });
  } catch (error) {
    next(error);
  }
};

export const getClubPosts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(50, Math.max(1, Number(req.query.size) || 10));

    const feed = await communityService.getClubPosts(req.params.id, page, size, req.user?.sub);
    res.status(200).json({ success: true, data: feed });
  } catch (error) {
    next(error);
  }
};

export const voteOnPoll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { optionId } = req.body ?? {};
    if (typeof optionId !== 'string' || !optionId.trim()) {
      res.status(400).json({ success: false, message: 'optionId is required' });
      return;
    }

    await communityService.voteOnPoll(optionId.trim(), req.user!.id);
    res.status(200).json({ success: true, message: 'Voted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getCommunityPollResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await communityService.getCommunityPollResult(req.params.id);
    if (!result) {
      res.status(404).json({ success: false, message: 'Poll not found' });
      return;
    }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const createClubEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, locationText, startAt, coverImageUrl } = req.body ?? {};

    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ success: false, message: 'title is required' });
      return;
    }
    if (typeof startAt !== 'string' || !startAt.trim()) {
      res.status(400).json({ success: false, message: 'startAt is required' });
      return;
    }

    const event = await communityService.createClubEvent(
      req.params.id,
      {
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : undefined,
        locationText: typeof locationText === 'string' ? locationText.trim() : undefined,
        startAt: startAt.trim(),
        coverImageUrl: typeof coverImageUrl === 'string' ? coverImageUrl.trim() : undefined,
      },
      req.user!
    );

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
};

export const getClubEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await communityService.getClubEvents(req.params.id, req.user?.sub);
    res.status(200).json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
};

export const rsvpClubEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rsvp } = req.body ?? {};
    if (typeof rsvp !== 'boolean') {
      res.status(400).json({ success: false, message: 'rsvp boolean is required' });
      return;
    }

    await communityService.rsvpClubEvent(req.params.eventId, req.user!.id, rsvp);
    res.status(200).json({ success: true, message: rsvp ? 'RSVP successful' : 'RSVP cancelled' });
  } catch (error) {
    next(error);
  }
};

export const requestJoinClub = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await communityService.requestJoinClub(req.params.id, req.user!.id);
    res.status(200).json({ success: true, message: 'Join request sent' });
  } catch (error) {
    next(error);
  }
};

export const getClubJoinRequests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requests = await communityService.getClubJoinRequests(req.params.id, req.user!.id);
    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

export const resolveJoinRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body ?? {};
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }
    await communityService.resolveJoinRequest(req.params.id, req.user!.id, req.params.userId, status);
    res.status(200).json({ success: true, message: 'Join request resolved' });
  } catch (error) {
    next(error);
  }
};

export const updateClubDescription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { description } = req.body;
    if (!description) {
      res.status(400).json({ success: false, message: 'Description is required' });
      return;
    }
    const updated = await communityService.updateClubDescription(req.params.id, description, req.user!.id);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const getClubMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const size = parseInt(req.query.size as string) || 10;
    const members = await communityService.getClubMembers(req.params.id, page, size);
    res.status(200).json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
};

export const updateClubCoverImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { coverImageBase64 } = req.body ?? {};
    if (typeof coverImageBase64 !== 'string' || !coverImageBase64.trim()) {
      res.status(400).json({ success: false, message: 'coverImageBase64 is required' });
      return;
    }

    const result = await communityService.updateClubCoverImage(
      req.params.id,
      coverImageBase64.trim(),
      req.user!.id
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getClubAnnouncements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(req.query.size) || 20));

    const announcements = await communityService.getClubAnnouncements(
      req.params.id,
      req.user!.id,
      page,
      size
    );
    res.status(200).json({ success: true, data: announcements });
  } catch (error) {
    next(error);
  }
};

export const createClubAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, content, images } = req.body ?? {};
    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ success: false, message: 'content is required' });
      return;
    }

    const result = await communityService.createClubAnnouncement(
      req.params.id,
      {
        title: typeof title === 'string' && title.trim() ? title.trim() : undefined,
        content: content.trim(),
        images: Array.isArray(images) ? images : undefined,
      },
      req.user!.id
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

